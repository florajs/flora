/**
 * @module request-resolver
 */
'use strict';

var _ = require('lodash');
var RequestError = require('flora-errors').RequestError;
var ImplementationError = require('flora-errors').ImplementationError;

/**
 * This is where the magic happens.
 *
 * @param {Request} req
 * @param resourceConfigs
 * @return {Object}
 */
module.exports = function (req, resourceConfigs) {
    if (!req.resource) {
        throw new RequestError('Resource not specified in request');
    }

    // init recursion:
    var resolvedConfig = {resource: req.resource, many: true};
    var context = {
        resourceConfigs: resourceConfigs,
        resourceTree: null,
        isMainResource: true,
        attrPath: []
    };
    var resourceTree, dataSourceTree;

    resolveIncludes(resolvedConfig, context);
    resourceTree = mapRequestRecursive(req, resolvedConfig, context);
    dataSourceTree = resolveResourceTree(resourceTree);

    return {
        resolvedConfig: resolvedConfig,
        dataSourceTree: dataSourceTree
    };
};

/**
 * Map request against resource-config, validate everything, return a Resource-Tree
 * with prepared DataSource-requests (which will be resolved to the final requests
 * later)
 *
 * @param {Object}  req         - Part of request at current depth
 * @param {Object}  attrNode    - Resource-config node at current depth
 * @param {Object}  context     - "Global" things and context for better error-handling
 * @private
 */
function mapRequestRecursive(req, attrNode, context) {
    var isMainResource;
    var subResourceTree;
    var subAttrName, subAttrNode, subContext;

    if (attrNode.hidden && !context.internalSelect) {
        throw new RequestError([
            'Unknown attribute "' + context.attrPath.join('.') + '"',
            'in request - it is a hidden attribute'
        ].join(' '));
    }

    if (!context.internalSelect) {
        attrNode.selected = true;
    }

    if (attrNode.dataSources) {
        subResourceTree = {
            dataSources: attrNode.dataSources,
            attrPath: context.attrPath,
            attrNode: attrNode,
            attributes: []
        };

        if (attrNode.resourceName) subResourceTree.resourceName = attrNode.resourceName;

        if (attrNode.primaryKey && attrNode.resolvedPrimaryKey) {
            subResourceTree.primaryKey = attrNode.resolvedPrimaryKey;

            // always select primaryKey:
            attrNode.primaryKey.forEach(function (primaryKeyAttrPath) {
                var primaryKeyAttrNode = getAttribute(primaryKeyAttrPath, attrNode, context);

                if (!primaryKeyAttrNode.hidden && !context.internalSelect) {
                    primaryKeyAttrNode.selected = true;
                }

                subResourceTree.attributes.push({
                    dataSourceMap: primaryKeyAttrNode.map.default,
                    attrNode: primaryKeyAttrNode,
                    fromDataSource: '#all-selected'
                });
            });

            context.useRequestError = true;
        }

        isMainResource = true;

        if (context.resourceTree) {
            isMainResource = false;

            // select parentKey from DataSource:
            subResourceTree.parentKey = attrNode.resolvedParentKey;
            subResourceTree.multiValuedParentKey = false;
            attrNode.parentKey.forEach(function (parentKeyAttrPath) {
                var parentKeyAttrNode = getAttribute(parentKeyAttrPath, context.resourceTree.attrNode, context);
                context.resourceTree.attributes.push({
                    dataSourceMap: parentKeyAttrNode.map.default,
                    attrNode: parentKeyAttrNode,
                    fromDataSource: '#current-primary'
                });
                if (parentKeyAttrNode.multiValued && attrNode.parentKey.length === 1) {
                    subResourceTree.multiValuedParentKey = true;
                }
            });

            // select childKey from DataSource:
            subResourceTree.childKey = attrNode.resolvedChildKey;
            attrNode.childKey.forEach(function (childKeyAttrPath) {
                var childKeyAttrNode = getAttribute(childKeyAttrPath, attrNode, context);
                subResourceTree.attributes.push({
                    dataSourceMap: childKeyAttrNode.map.default,
                    attrNode: childKeyAttrNode,
                    fromDataSource: '#current-primary'
                });
            });

            // for m:n relations with join-table: pass through joinVia option and select attributes
            if (attrNode.joinVia) {
                subResourceTree.joinVia = attrNode.joinVia;

                var joinDataSource = attrNode.dataSources[attrNode.joinVia];
                ['joinParentKey', 'joinChildKey'].forEach(function (joinKeyName) {
                    joinDataSource[joinKeyName].forEach(function (joinKeyAttrPath) {
                        var joinKeyAttrNode = getAttribute(joinKeyAttrPath, attrNode, context);
                        subResourceTree.attributes.push({
                            dataSourceMap: joinKeyAttrNode.map.default,
                            attrNode: joinKeyAttrNode,
                            fromDataSource: attrNode.joinVia
                        });
                    });
                });
            }

            // uniqueChildKey flag is needed for pre-indexing in result-builder:
            if (!attrNode.many) {
                subResourceTree.uniqueChildKey = true;
            } else if (subResourceTree.multiValuedParentKey) {
                subResourceTree.uniqueChildKey = true;
            } else if (attrNode.joinVia) {
                // references joinVia-DataSource here, primary-DataSource is always true later:
                subResourceTree.uniqueChildKey = false;
            } else {
                subResourceTree.uniqueChildKey = false;
            }

            // prepare filter for sub-resource:
            subResourceTree.filter = [[{
                attribute: subResourceTree.childKey,
                operator: 'equal',
                valueFromParentKey: true
            }]];

            // link Sub-Resource to parent:
            if (!context.resourceTree.children) {
                context.resourceTree.children = [];
            }
            context.resourceTree.children.push(subResourceTree);
        }

        // switch context:
        context = _.clone(context);
        context.resourceTree = subResourceTree;
        context.isMainResource = isMainResource;

        processRequestOptions(req, attrNode, context);
    } else {
        if (!context.resourceTree) {
            throw new ImplementationError('No DataSources defined in resource');
        }

        // error handling: only "select" is possible on non-resource-nodes:
        var subResourceOptions = Object.keys(req);
        if (subResourceOptions.length > 0) {
            if (subResourceOptions.length > 1 || subResourceOptions.indexOf('select') === -1) {
                throw new RequestError('Sub-Resource options not possible on "' + context.attrPath.join('.') + '"');
            }
        }

        if (attrNode.map) {
            context.resourceTree.attributes.push({dataSourceMap: attrNode.map.default, attrNode: attrNode});
        }
    }

    // tree recursion:
    if (req.select) {
        subContext = _.clone(context);

        for (subAttrName in req.select) {
            subAttrNode = getAttribute([subAttrName], attrNode, context);
            subContext.attrPath = context.attrPath.concat([subAttrName]);

            mapRequestRecursive(req.select[subAttrName], subAttrNode, subContext);
        }
    }

    // dependencies:
    if (attrNode.depends && !context.internalSelect) {
        subContext = _.clone(context);
        subContext.internalSelect = true;

        for (subAttrName in attrNode.depends) {
            subAttrNode = getAttribute([subAttrName], context.resourceTree.attrNode, context);
            subContext.attrPath = context.resourceTree.attrPath.concat([subAttrName]);

            mapRequestRecursive(attrNode.depends[subAttrName], subAttrNode, subContext);
        }
    }

    return context.resourceTree;
}

/**
 * Process options: id, filter, search, order, limit, page
 *
 * @private
 */
function processRequestOptions(req, attrNode, context) {
    if ('id' in req) {
        if (context.attrPath.length > 0) {
            throw new RequestError('ID option only allowed at root (in "' + context.attrPath.join('.') + '")');
        }

        // TODO: Cast req.id to defined type and handle composite primaryKey

        attrNode.many = false;

        context.resourceTree.filter = [[{
            attribute: context.resourceTree.primaryKey,
            operator: 'equal',
            value: req.id
        }]];
    }

    if ('filter' in req) {
        var filter = req.filter.map(function (andFilter) {
            return andFilter.map(function (filter) {
                var filteredAttrNode = attrNode;
                var subResourceAttrNodes = [];

                filter.attribute.forEach(function (subAttr) {
                    filteredAttrNode = getAttribute([subAttr], filteredAttrNode, context);
                    if (filteredAttrNode.dataSources) subResourceAttrNodes.push(filteredAttrNode);
                });

                if (!filteredAttrNode.filter) {
                    throw new RequestError([
                        'Can not filter by attribute "' + filter.attribute.join('.') + '" ',
                        context.attrPath.length > 0 ? '(in "' + context.attrPath.join('.') + '") ' : ''
                    ].join(''));
                }
                if (filteredAttrNode.filter.indexOf(filter.operator) === -1) {
                    throw new RequestError([
                        'Can not filter by attribute "' + filter.attribute.join('.') + '" ',
                        context.attrPath.length > 0 ? '(in "' + context.attrPath.join('.') + '") ' : '',
                        'with "' + filter.operator + '" ',
                        '(allowed operators: ' + filteredAttrNode.filter.join(', ') + ')'
                    ].join(''));
                }

                var resolvedFilter = {
                    attribute: filteredAttrNode.map.default,
                    operator: filter.operator,
                    value: filter.value
                };
                var parentFilter = resolvedFilter;

                // resolve filter by sub-resources:
                if (subResourceAttrNodes.length > 0) {
                    var subFilter;
                    if (attrNode.subFilters) {
                        attrNode.subFilters.forEach(function (_subFilter) {
                            if (filter.attribute.join('.') === _subFilter.attribute.join('.')) {
                                subFilter = _subFilter;
                            }
                        });
                    }

                    if (!subFilter) {
                        throw new RequestError([
                            'Can not filter by sub-resource attribute "' + filter.attribute.join('.') + '" ',
                            context.attrPath.length > 0 ? '(in "' + context.attrPath.join('.') + '") ' : ''
                        ].join(''));
                    }
                    if (subFilter.filter.indexOf(filter.operator) === -1) {
                        throw new RequestError([
                            'Can not filter by sub-resource attribute "' + filter.attribute.join('.') + '" ',
                            context.attrPath.length > 0 ? '(in "' + context.attrPath.join('.') + '") ' : '',
                            'with "' + filter.operator + '" ',
                            '(allowed operators: ' + subFilter.filter.join(', ') + ')'
                        ].join(''));
                    }

                    var filterContext = context;
                    subResourceAttrNodes.forEach(function (subResourceAttrNode) {
                        var subFilterTree = {
                            dataSources: cloneDeep(subResourceAttrNode.dataSources),
                            attributes: [],
                            filter: null,
                            parentKey: subResourceAttrNode.resolvedParentKey,
                            childKey: subResourceAttrNode.resolvedChildKey
                        };

                        // select childKey from DataSource:
                        subResourceAttrNode.childKey.forEach(function (childKeyAttrPath) {
                            var childKeyAttrNode = getAttribute(childKeyAttrPath, subResourceAttrNode, context);
                            subFilterTree.attributes.push({
                                dataSourceMap: childKeyAttrNode.map.default,
                                attrNode: childKeyAttrNode,
                                fromDataSource: '#current-primary'
                            });
                        });

                        // handle m:n relations with join-table:
                        if (subResourceAttrNode.joinVia) {
                            throw new ImplementationError('TODO: Filter by sub-resources with joinVia not implemented :-(');
                        }

                        // modify parent-filter to sub-filter:
                        parentFilter.attribute = subResourceAttrNode.resolvedParentKey;
                        parentFilter.operator = 'equal';
                        parentFilter.valueFromSubFilter = true;
                        delete parentFilter.value;

                        // ... then filter sub-resource by given attribute:
                        parentFilter = {
                            attribute: filteredAttrNode.map.default,
                            operator: filter.operator,
                            value: filter.value
                        };
                        subFilterTree.filter = [[parentFilter]];

                        // link sub-filter to parent:
                        if (!filterContext.resourceTree.subFilters) {
                            filterContext.resourceTree.subFilters = [];
                        }
                        filterContext.resourceTree.subFilters.push(subFilterTree);

                        // switch filter-context:
                        filterContext = _.clone(filterContext);
                        filterContext.resourceTree = subFilterTree;
                    });
                }

                // TODO: Check type of values

                return resolvedFilter;
            });
        });

        if (context.resourceTree.filter) {
            // generate cross product of OR filters:
            var combinedFilter = [];
            filter.forEach(function (andFilter) {
                context.resourceTree.filter.forEach(function (andFilter2) {
                    combinedFilter.push(cloneDeep(andFilter).concat(cloneDeep(andFilter2)));
                });
            });
            filter = combinedFilter;
        }

        context.resourceTree.filter = filter;
    }

    if ('search' in req) {
        context.resourceTree.search = req.search;
    }

    var order = req.order || attrNode.defaultOrder;
    if (order) {
        context.resourceTree.order = order.map(function (order) {
            var orderedAttrNode = getAttribute(order.attribute, attrNode, context);

            if (!orderedAttrNode.order) {
                throw new RequestError([
                    'Attribute "' + order.attribute.join('.') + '" ',
                    context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '") ' : '',
                    'can not be ordered'
                ].join(''));
            }
            if (orderedAttrNode.order.indexOf(order.direction) === -1) {
                throw new RequestError([
                    'Attribute "' + order.attribute.join('.') + '" ',
                    context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : '',
                    'can not be ordered "' + order.direction + '" (allowed: ' + orderedAttrNode.order.join(', ') + ')'
                ].join(''));
            }

            // TODO: Check if same resource - implement order by Sub-Resource?

            order = _.clone(order);
            order.attribute = orderedAttrNode.map.default;

            return order;
        });
    }

    var limit;
    if ('limit' in req) {
        limit = req.limit;
    } else if (context.isMainResource && !('id' in req)) {
        limit = attrNode.defaultLimit || attrNode.maxLimit || 10;
    }
    if (attrNode.maxLimit) {
        if (limit === null) {
            throw new RequestError(
                'Invalid limit "unlimited", maxLimit is ' + attrNode.maxLimit +
                (context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : '')
            );
        }
        limit = limit || attrNode.maxLimit;
        if (limit > attrNode.maxLimit) {
            throw new RequestError(
                'Invalid limit ' + limit + ', maxLimit is ' + attrNode.maxLimit +
                (context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : '')
            );
        }
    }
    if (limit) context.resourceTree.limit = limit;

    if ('page' in req) {
        if (!('limit' in req)) {
            throw new RequestError('Always specify a fixed limit when requesting page' +
                (context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : ''));
        }

        context.resourceTree.page = req.page;
    }
}

/**
 * Deep-clone an object and try to be efficient
 *
 * @param {object} obj
 * @return {object}
 */
function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Resolve included resource (recursive at top level) and clone their configs deeply
 *
 * @private
 */
function resolveIncludes(attrNode, context) {
    var maxDepth = 10, includeStack = [], subResourceConfig;

    while (attrNode.resource) {
        includeStack.push(attrNode.resource);
        if (includeStack.length >= maxDepth) {
            throw new ImplementationError('Resource inclusion depth too big' +
                (context.attrPath.length > 0 ? ' at "' + context.attrPath.join('.') + '"' : '') +
                ' (included from: ' + includeStack.join(' -> ') + ')');
        }

        if (!context.resourceConfigs[attrNode.resource]) {
            if (context.attrPath.length === 0 && includeStack.length === 1) {
                throw new RequestError('Unknown resource "' + attrNode.resource + '" in request');
            } else {
                throw new ImplementationError('Unknown resource "' + attrNode.resource + '"' +
                    (context.attrPath.length > 0 ? ' at "' + context.attrPath.join('.') + '"' : '') +
                    (includeStack.length > 1 ? ' (included from: ' + includeStack.join(' -> ') + ')' : ''));
            }
        }

        subResourceConfig = context.resourceConfigs[attrNode.resource];
        attrNode.resourceName = attrNode.resource;
        delete attrNode.resource;

        mergeSubResource(attrNode, cloneDeep(subResourceConfig), context);
    }
}

/**
 * Merges additional options, attributes and DataSources from parent-resource
 * into sub-resource.
 *
 * @param attrNode Destination node
 * @param subResourceConfig Deeply cloned sub-resource-config
 * @private
 */
function mergeSubResource(attrNode, subResourceConfig, context) {
    var optionName, attrName, newAttributes, dataSourceName, newDataSources;

    // Merge options from sub-resource to parent (order is irrelevant here):
    for (optionName in subResourceConfig) {
        if (optionName === 'attributes') {
            newAttributes = subResourceConfig.attributes;

            if (attrNode.attributes) {
                for (attrName in attrNode.attributes) {
                    if (newAttributes[attrName]) {
                        throw new ImplementationError('Cannot overwrite attribute "' + attrName + '"' +
                            ' in "' + context.attrPath.join('.') + '"');
                    }

                    newAttributes[attrName] = attrNode.attributes[attrName];
                }
            }

            attrNode.attributes = newAttributes;
        } else if (optionName === 'dataSources') {
            newDataSources = subResourceConfig.dataSources;

            if (attrNode.dataSources) {
                for (dataSourceName in attrNode.dataSources) {
                    if (newDataSources[dataSourceName]) {
                        throw new ImplementationError('Cannot overwrite DataSource "' + dataSourceName + '"' +
                            ' in "' + context.attrPath.join('.') + '"');
                    }

                    newDataSources[dataSourceName] = attrNode.dataSources[dataSourceName];
                }
            }

            attrNode.dataSources = newDataSources;
        } else {
            attrNode[optionName] = subResourceConfig[optionName];
        }
    }
}

/**
 * Resolve attribute path relative to attrNode, handle included resources
 * and return child attrNode
 *
 * @param path Array of attribute-names representing the path
 * @param attrNode Root node where to start resolving
 * @param context "Global" things and context for better error-handling
 * @private
 */
function getAttribute(path, attrNode, context) {
    path.forEach(function (attributeName, i) {
        if (!(attrNode.attributes && attrNode.attributes[attributeName])) {
            throw new RequestError([
                'Unknown attribute',
                '"' + context.attrPath.concat(path.slice(0, i + 1)).join('.') + '"',
                'in request'
            ].join(' '));
        }

        attrNode = attrNode.attributes[attributeName];

        if (attrNode.resource) {
            var subContext = _.clone(context);
            subContext.attrPath = subContext.attrPath.concat(path.slice(0, i + 1));
            resolveIncludes(attrNode, subContext);
        }
    });

    return attrNode;
}

/**
 * Resolve Resource-Tree with prepared DataSource-requests to the final DataSource-Tree,
 * resolve dependencies and drop redundant DataSources
 *
 * @private
 */
function resolveResourceTree(resourceTree, parentPrimaryName) {
    var dataSourceTree;
    var dataSources = {}, dataSourceName, primaryName;

    primaryName = selectPrimaryDataSource(resourceTree);

    if (resourceTree.attrNode) {
        resourceTree.attrNode.primaryDataSource = primaryName;
    }

    // determine needed DataSources (simple logic - to be optimized for complex cases):
    dataSources[primaryName] = true;
    resourceTree.attributes.forEach(function (attrInfo) {
        if (attrInfo.fromDataSource === '#all-selected' || attrInfo.fromDataSource === '#current-primary') return;

        for (dataSourceName in attrInfo.dataSourceMap) {
            dataSources[dataSourceName] = true;
            break;
        }
    });

    // initialize needed DataSources:
    for (dataSourceName in dataSources) {
        dataSources[dataSourceName] = resourceTree.dataSources[dataSourceName];
    }

    resolveDataSourceAttributes(resourceTree, dataSources, primaryName);
    resolveDataSourceOptions(resourceTree, dataSources, primaryName);

    dataSourceTree = {};
    if (resourceTree.attrPath) {
        dataSourceTree.attributePath = resourceTree.attrPath;
        dataSourceTree.dataSourceName = primaryName;
    }
    dataSourceTree.request = dataSources[primaryName];
    dataSourceTree.attributeOptions = dataSourceTree.request.attributeOptions;
    delete dataSourceTree.request.attributeOptions;

    if (resourceTree.resourceName) dataSourceTree.resourceName = resourceTree.resourceName;

    if (parentPrimaryName && resourceTree.parentKey && resourceTree.childKey) {
        if (!resourceTree.parentKey[parentPrimaryName]) {
            throw new ImplementationError([
                'Parent key of "' + resourceTree.attrPath.join('.') + '"',
                'not in "primary"-DataSource of parent resource'
            ].join(' '));
        }

        dataSourceTree.parentKey = resourceTree.parentKey[parentPrimaryName];
        dataSourceTree.childKey = resourceTree.childKey[primaryName];
        if ('multiValuedParentKey' in resourceTree && 'uniqueChildKey' in resourceTree) {
            dataSourceTree.multiValuedParentKey = resourceTree.multiValuedParentKey;
            dataSourceTree.uniqueChildKey = resourceTree.uniqueChildKey;
        }
    }

    // append Sub-DataSources:
    for (dataSourceName in dataSources) {
        if (dataSourceName === primaryName) continue;
        if (dataSources[dataSourceName].joinParentKey) continue;

        if (!dataSourceTree.subRequests) {
            dataSourceTree.subRequests = [];
        }

        var filter = {
            attribute: resourceTree.primaryKey[dataSourceName],
            operator: 'equal',
            valueFromParentKey: true
        };

        if (filter.attribute.length === 1) {
            filter.attribute = filter.attribute[0];
        }

        dataSources[dataSourceName].filter = [[filter]];

        var subRequest = {
            attributePath: resourceTree.attrPath,
            dataSourceName: dataSourceName,
            parentKey: resourceTree.primaryKey[primaryName],
            childKey: resourceTree.primaryKey[dataSourceName],
            multiValuedParentKey: false,
            uniqueChildKey: true,
            request: dataSources[dataSourceName]
        };

        subRequest.attributeOptions = subRequest.request.attributeOptions;
        delete subRequest.request.attributeOptions;

        dataSourceTree.subRequests.push(subRequest);
    }

    if (resourceTree.subFilters) {
        resourceTree.subFilters.forEach(function(subFilterTree) {
            var subDataSourceTree = resolveResourceTree(subFilterTree, primaryName);

            if (!dataSourceTree.subFilters) {
                dataSourceTree.subFilters = [];
            }
            dataSourceTree.subFilters.push(subDataSourceTree);
        });
    }

    if (resourceTree.children) {
        resourceTree.children.forEach(function(subResourceTree) {
            var subDataSourceTree = resolveResourceTree(subResourceTree, primaryName);

            if (!dataSourceTree.subRequests) {
                dataSourceTree.subRequests = [];
            }
            dataSourceTree.subRequests.push(subDataSourceTree);
        });
    }

    // handle m:n relations with join-table (insert an additional request into
    // the tree and move the original request one level deeper):
    if (resourceTree.joinVia) {
        var joinDataSource = resourceTree.dataSources[resourceTree.joinVia];
        joinDataSource.filter = [[{
            attribute: joinDataSource.resolvedJoinParentKey.length === 1 ?
                joinDataSource.resolvedJoinParentKey[0] : joinDataSource.resolvedJoinParentKey,
            operator: 'equal',
            valueFromParentKey: true
        }]];

        var originalDataSourceTree = dataSourceTree;
        dataSourceTree = {
            attributePath: resourceTree.attrPath,
            dataSourceName: resourceTree.joinVia,
            parentKey: originalDataSourceTree.parentKey,
            childKey: joinDataSource.resolvedJoinParentKey,
            multiValuedParentKey: false,
            uniqueChildKey: originalDataSourceTree.uniqueChildKey,
            request: joinDataSource,
            attributeOptions: joinDataSource.attributeOptions,
            subRequests: [originalDataSourceTree]
        };
        originalDataSourceTree.parentKey = joinDataSource.resolvedJoinChildKey;
        originalDataSourceTree.uniqueChildKey = true;

        delete joinDataSource.attributeOptions;
        delete joinDataSource.joinParentKey;
        delete joinDataSource.resolvedJoinParentKey;
        delete joinDataSource.joinChildKey;
        delete joinDataSource.resolvedJoinChildKey;
    }

    return dataSourceTree;
}

/**
 * @param resourceTree
 * @return {string}
 * @private
 */
function selectPrimaryDataSource(resourceTree) {
    var primaryName = 'primary', dataSourceName;

    if (resourceTree.search) {
        // select primary DataSource for searching (maybe other than "primary"):
        primaryName = null;
        for (dataSourceName in resourceTree.dataSources) {
            if (resourceTree.dataSources[dataSourceName].searchable) {
                primaryName = dataSourceName;
                break;
            }
        }
        if (primaryName === null) {
            throw new RequestError('Resource does not support fulltext-search');
        }
    }

    return primaryName;
}

/**
 * Distribute attributes over DataSources
 *
 * @private
 */
function resolveDataSourceAttributes(resourceTree, dataSources, primaryName) {
    var dataSourceName, dataSource;

    for (dataSourceName in dataSources) {
        dataSource = dataSources[dataSourceName];
        dataSource.attributes = [];
        dataSource.attributeOptions = {};
    }

    resourceTree.attributes.forEach(function (attrInfo) {
        var selectedDataSources;

        if (attrInfo.fromDataSource === '#all-selected') {
            attrInfo.attrNode.selectedDataSource = primaryName;
            selectedDataSources = [];
            for (dataSourceName in dataSources) {
                if (dataSources[dataSourceName].joinParentKey) continue;
                selectedDataSources.push(dataSourceName);
            }
        } else if (attrInfo.fromDataSource === '#current-primary') {
            attrInfo.attrNode.selectedDataSource = primaryName;
            selectedDataSources = [attrInfo.attrNode.selectedDataSource];
        } else if (attrInfo.fromDataSource) {
            attrInfo.attrNode.selectedDataSource = attrInfo.fromDataSource;
            selectedDataSources = [attrInfo.attrNode.selectedDataSource];
        } else {
            attrInfo.attrNode.selectedDataSource = null;
            for (dataSourceName in attrInfo.dataSourceMap) {
                if (dataSources[dataSourceName]) {
                    attrInfo.attrNode.selectedDataSource = dataSourceName;
                    break;
                }
            }
            if (!attrInfo.attrNode.selectedDataSource) {
                throw new ImplementationError('No proper DataSource selected for attribute ' +
                    '(this should not happen - bug in request-resolver in Flora core)');
            }
            selectedDataSources = [attrInfo.attrNode.selectedDataSource];
        }

        selectedDataSources.forEach(function (selectedDataSourceName) {
            var attribute = attrInfo.dataSourceMap[selectedDataSourceName];
            dataSources[selectedDataSourceName].attributes.push(attribute);
            dataSources[selectedDataSourceName].attributeOptions[attribute] =
                _.pick(attrInfo.attrNode, ['type', 'storedType', 'multiValued', 'delimiter']);
        });
    });

    for (dataSourceName in dataSources) { // make attributes unique:
        dataSources[dataSourceName].attributes = _.uniq(dataSources[dataSourceName].attributes);
    }
}

/**
 * Process options: filter, search, order, limit, page and finally resolve them to
 * primary DataSource
 *
 * @private
 */
function resolveDataSourceOptions(resourceTree, dataSources, primaryName) {
    if (resourceTree.filter) {
        dataSources[primaryName].filter = resourceTree.filter.map(function (andFilter) {
            return andFilter.map(function (filter) {
                if (!filter.attribute[primaryName]) {
                    throw new ImplementationError('All filtered attributes must be mapped to primary DataSource');
                }

                filter.attribute = filter.attribute[primaryName];
                if (filter.attribute.length === 1) {
                    filter.attribute = filter.attribute[0];
                }

                return filter;
            });
        });
    }

    if (resourceTree.search) {
        dataSources[primaryName].search = resourceTree.search;
    }

    if (resourceTree.order) {
        dataSources[primaryName].order = resourceTree.order.map(function (order) {
            if (!order.attribute[primaryName]) {
                throw new ImplementationError('All ordered attributes must be mapped to primary DataSource');
            }

            order.attribute = order.attribute[primaryName];

            return order;
        });
    }

    // TODO: Allow filter/order in different than the primary DataSource?

    if (resourceTree.limit) {
        dataSources[primaryName].limit = resourceTree.limit;
    }

    if (resourceTree.page) {
        dataSources[primaryName].page = resourceTree.page;
    }
}

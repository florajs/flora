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

    if (attrNode.internal) {
        throw new RequestError([
            'Unknown attribute',
            '"' + context.attrPath.join('.') + '"',
            'in request - it is an internal attribute'
        ].join(' '));
    }

    attrNode.selected = true;

    if (attrNode.dataSources) {
        subResourceTree = {
            dataSources: attrNode.dataSources,
            attrPath: context.attrPath,
            attrNode: attrNode,
            keyAttributes: [],
            attributes: []
        };

        if (attrNode.resourceName) subResourceTree.resourceName = attrNode.resourceName;

        if (attrNode.primaryKey && attrNode.resolvedPrimaryKey) {
            subResourceTree.primaryKey = attrNode.resolvedPrimaryKey;

            // always select primaryKey:
            attrNode.primaryKey.forEach(function (primaryKeyAttrPath) {
                var primaryKeyAttrNode = getAttribute(primaryKeyAttrPath, attrNode, context);

                primaryKeyAttrNode.selected = true;
                subResourceTree.keyAttributes.push({
                    dataSourceMap: primaryKeyAttrNode.map.default,
                    attrNode: primaryKeyAttrNode
                });
            });

            context.useRequestError = true;
        }

        isMainResource = true;

        if (context.resourceTree) {
            isMainResource = false;

            // handle parentKey/childKey relations:
            subResourceTree.parentKey = attrNode.parentKey || context.resourceTree.primaryKey;
            subResourceTree.childKey = attrNode.childKey || subResourceTree.primaryKey;

            context.resourceTree.attributes.push({dataSourceMap: subResourceTree.parentKey, attrNode: null});
            subResourceTree.attributes.push({dataSourceMap: subResourceTree.childKey, attrNode: null});

            // prepare filter for sub-resource:
            subResourceTree.filter = [[{
                attribute: subResourceTree.childKey,
                operator: 'equal',
                valueFromParentKey: true
            }]];

            // prepare attributeOptions for parentKey (hacky!):
            // TODO: remove after refactoring parentKey/childKey to mapped attributes
            if (!context.resourceTree.attributeOptions) {
                context.resourceTree.attributeOptions = [];
            }
            var attributeOption = _.pick(attrNode, ['type', 'storedType', 'multiValued', 'delimiter']);
            attributeOption.attribute = subResourceTree.parentKey;
            attributeOption.type = attrNode.type || (attrNode.delimiter ? 'string' : 'int');
            context.resourceTree.attributeOptions.push(attributeOption);

            // prepare attributeOptions for childKey (hacky!):
            // TODO: remove after refactoring parentKey/childKey to mapped attributes
            if (!subResourceTree.attributeOptions) {
                subResourceTree.attributeOptions = [];
            }
            attributeOption = _.pick(attrNode, ['type', 'storedType']);
            attributeOption.attribute = subResourceTree.childKey;
            attributeOption.type = attrNode.type || (attrNode.delimiter ? 'string' : 'int');
            subResourceTree.attributeOptions.push(attributeOption);

            // for m:n relations with join-table: pass through joinVia option
            if (attrNode.joinVia) {
                subResourceTree.joinVia = attrNode.joinVia;
            }

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
            throw new RequestError('ID option only allowed at root');
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
        if (context.resourceTree.filter) {
            // TODO: Combine with existent filter with "AND" (from "id" or "childKey")
            throw new RequestError([
                'Filter merging with primaryKey-filter not implemented',
                context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : ''
            ].join(' '));
        }

        context.resourceTree.filter = req.filter.map(function (andFilter) {
            return andFilter.map(function (filter) {
                var filteredAttrNode = getAttribute(filter.attribute, attrNode, context);

                if (!filteredAttrNode.filter) {
                    throw new RequestError([
                        'Attribute "' + filter.attribute.join('.') + '" ',
                        context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : '',
                        'can not be filtered'
                    ].join(''));
                }
                if (filteredAttrNode.filter.indexOf(filter.operator) === -1) {
                    throw new RequestError([
                        'Attribute "' + filter.attribute.join('.') + '" ',
                        context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : '',
                        'can not be filtered with "' + filter.operator + '" ',
                        '(allowed operators: ' + filteredAttrNode.filter.join(', ') + ')'
                    ].join(''));
                }

                // TODO: Check if same resource - if not, check against subFilters
                // TODO: Check type of values

                filter = _.clone(filter);
                filter.attribute = filteredAttrNode.map.default;

                return filter;
            });
        });
    }

    if ('search' in req) {
        context.resourceTree.search = req.search;
    }

    if ('order' in req) {
        context.resourceTree.order = req.order.map(function (order) {
            var orderedAttrNode = getAttribute(order.attribute, attrNode, context);

            if (!orderedAttrNode.order) {
                throw new RequestError([
                    'Attribute "' + order.attribute.join('.') + '" ',
                    context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : '',
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

    if ('limit' in req) {
        if (req.limit !== null) {
            context.resourceTree.limit = req.limit;
        }

        // TODO: resource-specific max-limit?
    } else if (context.isMainResource && !('id' in req)) {
        context.resourceTree.limit = 10; // TODO: resource-specific default-limit?
    }

    if ('page' in req) {
        if (!req.limit) {
            throw new RequestError('Always specify a fixed limit when requesting page');
        }

        context.resourceTree.page = req.page;
    }
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

        mergeSubResource(attrNode, _.cloneDeep(subResourceConfig), context);
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

    resourceTree.attrNode.primaryDataSource = primaryName;

    // determine needed DataSources (simple logic - to be optimized for complex cases):
    dataSources[primaryName] = true;
    resourceTree.attributes.forEach(function (attrInfo) {
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

    dataSourceTree = {
        attributePath: resourceTree.attrPath,
        dataSourceName: primaryName,
        request: dataSources[primaryName]
    };

    dataSourceTree.attributeOptions = dataSourceTree.request.attributeOptions;
    delete dataSourceTree.request.attributeOptions;

    if (resourceTree.resourceName) dataSourceTree.resourceName = resourceTree.resourceName;

    if (parentPrimaryName && resourceTree.parentKey && resourceTree.childKey) {
        if (!resourceTree.parentKey[parentPrimaryName]) {
            throw new ImplementationError([
                'Parent key of',
                '"' + resourceTree.attrPath.join('.') + '"',
                'not in "primary"-DataSource of parent resource'
            ].join(' '));
        }

        dataSourceTree.parentKey = resourceTree.parentKey[parentPrimaryName];
        dataSourceTree.childKey = resourceTree.childKey[primaryName];
    }

    // TODO: remove after refactoring parentKey/childKey to mapped attributes:
    if (resourceTree.attributeOptions) {
        resourceTree.attributeOptions.forEach(function (attributeOption) {
            if (!attributeOption.attribute[primaryName]) {
                return;
            }

            var attributes = attributeOption.attribute[primaryName];

            if (!Array.isArray(attributes)) { // arrays for composite keys cannot be resolved earlier
                attributes = [attributes];
            }

            attributes.forEach(function (attribute) {
                delete attributeOption.attribute;
                dataSourceTree.attributeOptions[attribute] = attributeOption;
            });
        });
    }

    // append Sub-DataSources:
    for (dataSourceName in dataSources) {
        if (dataSourceName === primaryName) continue;

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
            request: dataSources[dataSourceName]
        };

        subRequest.attributeOptions = subRequest.request.attributeOptions;
        delete subRequest.request.attributeOptions;

        dataSourceTree.subRequests.push(subRequest);
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
        var attributeOptions = {};

        joinDataSource.attributes = joinDataSource.joinParentKey.concat(joinDataSource.joinChildKey);
        joinDataSource.filter = [[{
            attribute: joinDataSource.joinParentKey.length === 1 ?
                joinDataSource.joinParentKey[0] : joinDataSource.joinParentKey,
            operator: 'equal',
            valueFromParentKey: true
        }]];

        // TODO: reimplement while refactoring joinParentKey/joinChildKey to mapped attributes:
        joinDataSource.attributes.forEach(function (attribute) {
            attributeOptions[attribute] = {type: 'int'};
        });

        var originalDataSourceTree = dataSourceTree;
        dataSourceTree = {
            attributePath: resourceTree.attrPath,
            dataSourceName: resourceTree.joinVia,
            parentKey: originalDataSourceTree.parentKey,
            childKey: joinDataSource.joinParentKey,
            request: joinDataSource,
            attributeOptions: attributeOptions,
            subRequests: [originalDataSourceTree]
        };
        originalDataSourceTree.parentKey = joinDataSource.joinChildKey;

        delete joinDataSource.joinParentKey;
        delete joinDataSource.joinChildKey;
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

    function getAttributeOptions(attrNode) {
        return _.pick(attrNode, ['type', 'storedType', 'multiValued', 'delimiter']);
    }

    for (dataSourceName in dataSources) {
        dataSource = dataSources[dataSourceName];
        dataSource.attributes = [];
        dataSource.attributeOptions = {};

        resourceTree.keyAttributes.forEach(function (attrInfo) {
            if (!attrInfo.dataSourceMap[dataSourceName]) {
                throw new ImplementationError('Key attribute not in "' + dataSourceName + '"-DataSource ' +
                    '(this should not happen - bug in request-resolver in Flora core)');
            }
            dataSource.attributes.push(attrInfo.dataSourceMap[dataSourceName]);
            dataSource.attributeOptions[attrInfo.dataSourceMap[dataSourceName]] =
                getAttributeOptions(attrInfo.attrNode);
        });
    }

    resourceTree.keyAttributes.forEach(function (attrInfo) {
        attrInfo.attrNode.selectedDataSource = primaryName;
    });

    resourceTree.attributes.forEach(function (attrInfo) {
        var attribute = null;

        for (dataSourceName in attrInfo.dataSourceMap) {
            if (dataSources[dataSourceName]) {
                attribute = attrInfo.dataSourceMap[dataSourceName];
                break;
            }
        }

        if (attribute === null) {
            throw new ImplementationError('No proper DataSource selected for attribute ' +
                '(this should not happen - bug in request-resolver in Flora core)');
        }

        if (!Array.isArray(attribute)) {
            attribute = [attribute]; // arrays for composite keys cannot be resolved earlier
        }
        attribute.forEach(function (attribute) {
            dataSources[dataSourceName].attributes.push(attribute);
            dataSources[dataSourceName].attributeOptions[attribute] =
                getAttributeOptions(attrInfo.attrNode);
        });

        if (attrInfo.attrNode) {
            attrInfo.attrNode.selectedDataSource = dataSourceName;
        }
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

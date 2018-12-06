'use strict';

const _ = require('lodash');
const has = require('has');
const { RequestError, ImplementationError } = require('flora-errors');

/**
 * Deep-clone an object and try to be efficient.
 *
 * @param {Object} obj
 * @returns {Object}
 * @private
 */
function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Merges additional options, attributes and DataSources from parent-resource
 * into sub-resource.
 *
 * @param attrNode - Destination node
 * @param subResourceConfig - Sub-resource-config (not cloned!)
 * @private
 */
function mergeSubResource(attrNode, subResourceConfig, context) {
    // Merge options from sub-resource to parent (order is irrelevant here):
    Object.keys(subResourceConfig).forEach(optionName => {
        if (optionName === 'attributes') {
            if (!attrNode._attrsRefs) attrNode._attrsRefs = [];
            attrNode._attrsRefs.push(subResourceConfig.attributes);
            if (!attrNode.attributes) attrNode.attributes = {};
        } else if (optionName === 'dataSources') {
            const newDataSources = Object.assign({}, subResourceConfig.dataSources);

            if (attrNode.dataSources) {
                Object.keys(attrNode.dataSources).forEach(dataSourceName => {
                    if (newDataSources[dataSourceName]) {
                        if (attrNode.dataSources[dataSourceName].inherit) {
                            if (attrNode.dataSources[dataSourceName].inherit === 'inherit') {
                                newDataSources[dataSourceName] = Object.assign(
                                    {},
                                    newDataSources[dataSourceName],
                                    attrNode.dataSources[dataSourceName]
                                );
                            } else if (attrNode.dataSources[dataSourceName].inherit === 'replace') {
                                newDataSources[dataSourceName] = attrNode.dataSources[dataSourceName];
                            }
                        } else {
                            throw new ImplementationError(
                                `Cannot overwrite DataSource "${dataSourceName}"` +
                                    ` in "${context.attrPath.join('.')}"`
                            );
                        }
                    } else {
                        newDataSources[dataSourceName] = attrNode.dataSources[dataSourceName];
                    }
                });
            }

            attrNode.dataSources = newDataSources;
        } else if (typeof subResourceConfig[optionName] === 'object') {
            attrNode[optionName] = cloneDeep(subResourceConfig[optionName]);
        } else {
            attrNode[optionName] = subResourceConfig[optionName];
        }
    });
}

/**
 * Resolve included resource (recursive at top level) and clone their configs deeply
 *
 * @private
 */
function resolveIncludes(attrNode, context) {
    const maxDepth = 10;
    const includeStack = [];
    let subResourceConfig;

    while (attrNode.resource) {
        includeStack.push(attrNode.resource);
        if (includeStack.length >= maxDepth) {
            throw new ImplementationError(
                'Resource inclusion depth too big' +
                    (context.attrPath.length > 0 ? ' at "' + context.attrPath.join('.') + '"' : '') +
                    ' (included from: ' +
                    includeStack.join(' -> ') +
                    ')'
            );
        }

        if (!context.resourceConfigs[attrNode.resource] || !context.resourceConfigs[attrNode.resource].config) {
            if (context.attrPath.length === 0 && includeStack.length === 1) {
                throw new RequestError('Unknown resource "' + attrNode.resource + '" in request');
            } else {
                throw new ImplementationError(
                    'Unknown resource "' +
                        attrNode.resource +
                        '"' +
                        (context.attrPath.length > 0 ? ' at "' + context.attrPath.join('.') + '"' : '') +
                        (includeStack.length > 1 ? ' (included from: ' + includeStack.join(' -> ') + ')' : '')
                );
            }
        }

        subResourceConfig = context.resourceConfigs[attrNode.resource].config;
        attrNode.resourceName = attrNode.resource;
        delete attrNode.resource;

        mergeSubResource(attrNode, subResourceConfig, context);
    }
}

/**
 * Resolve attribute path relative to attrNode, handle included resources
 * and return child attrNode
 *
 * @param path - Array of attribute-names representing the path
 * @param attrNode - Root node where to start resolving
 * @param context - "Global" things and context for better error-handling
 * @private
 */
function getAttribute(path, attrNode, context) {
    path.forEach((attributeName, i) => {
        if (!(attrNode.attributes && attrNode.attributes[attributeName])) {
            if (attrNode._attrsRefs) {
                let subAttrNode = null;
                attrNode._attrsRefs.forEach(attrsRef => {
                    if (!attrsRef[attributeName]) return;

                    if (subAttrNode) {
                        throw new ImplementationError(
                            `Cannot overwrite attribute "${attributeName}" ` + `in "${context.attrPath.join('.')}"`
                        );
                    }

                    const attrRef = attrsRef[attributeName];

                    subAttrNode = {};
                    Object.keys(attrRef).forEach(optionName => {
                        if (optionName === 'attributes') {
                            subAttrNode._attrsRefs = [attrRef.attributes];
                            subAttrNode[optionName] = {};
                        } else if (optionName === 'dataSources') {
                            // DataSources are handled/cloned later in resolveResourceTree():
                            subAttrNode[optionName] = attrRef[optionName];
                        } else if (typeof attrRef[optionName] === 'object') {
                            subAttrNode[optionName] = cloneDeep(attrRef[optionName]);
                        } else {
                            subAttrNode[optionName] = attrRef[optionName];
                        }
                    });

                    attrNode.attributes[attributeName] = subAttrNode;
                });
            }

            if (!(attrNode.attributes && attrNode.attributes[attributeName])) {
                throw new RequestError(
                    'Unknown attribute ' + `"${context.attrPath.concat(path.slice(0, i + 1)).join('.')}" in request`
                );
            }
        }

        attrNode = attrNode.attributes[attributeName];

        if (attrNode.resource) {
            const subContext = Object.assign({}, context);
            subContext.attrPath = subContext.attrPath.concat(path.slice(0, i + 1));
            resolveIncludes(attrNode, subContext);
        }
    });

    return attrNode;
}

/**
 * @private
 */
function mergeRequest(req, dependency, attrNode, context) {
    if (dependency.select) {
        const subContext = Object.assign({}, context);
        if (!req.select) req.select = {};

        Object.keys(dependency.select).forEach(subAttrName => {
            const subAttrNode = getAttribute([subAttrName], attrNode, context);
            subContext.attrPath = context.attrPath.concat([subAttrName]);

            if (!req.select[subAttrName]) {
                req.select[subAttrName] = cloneDeep(dependency.select[subAttrName]);
                // it is enough to set the root of selected sub-nodes to "internal = true",
                // because result-builder will not follow this node anyway then, so we leave
                // the sub-nodes well alone:
                req.select[subAttrName].internal = true;

                if (subAttrNode.depends) {
                    // resolve dependency of dependency:
                    mergeRequest(
                        context.refRequest,
                        { select: subAttrNode.depends },
                        context.refAttrNode,
                        context.refContext
                    );
                }
            } else {
                mergeRequest(req.select[subAttrName], dependency.select[subAttrName], subAttrNode, subContext);
            }
        });
    }
}

/**
 * Merge dependencies of selected attributes within current (sub-)resource into request and handle
 * recursive dependencies.
 *
 * @private
 */
function resolveDependencies(req, attrNode, context) {
    if (!context.refRequest) {
        // remember (sub-)resource-root because all dependencies are relative to it:
        context = Object.assign({}, context);
        context.refRequest = req;
        context.refAttrNode = attrNode;
        context.refContext = context;
    }

    if (attrNode.depends) {
        // we resolve dependencies (and sub-dependencies) in place. Only unprocessed
        // attributes are resolved again inside mergeRequest(), so we do not enter
        // endless recursion on cyclic dependencies:
        mergeRequest(context.refRequest, { select: attrNode.depends }, context.refAttrNode, context.refContext);
    }

    if (req.select) {
        const subContext = Object.assign({}, context);
        Object.keys(req.select).forEach(subAttrName => {
            const subAttrNode = getAttribute([subAttrName], attrNode, context);
            if (subAttrNode.dataSources) return;
            subContext.attrPath = context.attrPath.concat([subAttrName]);

            resolveDependencies(req.select[subAttrName], subAttrNode, subContext);
        });
    }
}

/**
 * Process options: id, filter, search, order, limit, page.
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

        context.resourceTree.filter = [
            [
                {
                    attribute: context.resourceTree.primaryKey,
                    operator: 'equal',
                    value: req.id
                }
            ]
        ];
    }

    if ('filter' in req) {
        let requestFilter = req.filter.map(andFilter =>
            andFilter.map(filter => {
                let filteredAttrNode = attrNode;
                const subResourceAttrNodes = [];

                filter.attribute.forEach(subAttr => {
                    filteredAttrNode = getAttribute([subAttr], filteredAttrNode, context);
                    if (filteredAttrNode.dataSources) subResourceAttrNodes.push(filteredAttrNode);
                });

                if (!filteredAttrNode.filter) {
                    throw new RequestError(
                        [
                            'Can not filter by attribute "' + filter.attribute.join('.') + '" ',
                            context.attrPath.length > 0 ? '(in "' + context.attrPath.join('.') + '") ' : ''
                        ].join('')
                    );
                }
                if (filteredAttrNode.filter.indexOf(filter.operator) === -1) {
                    throw new RequestError(
                        [
                            'Can not filter by attribute "' + filter.attribute.join('.') + '" ',
                            context.attrPath.length > 0 ? '(in "' + context.attrPath.join('.') + '") ' : '',
                            'with "' + filter.operator + '" ',
                            '(allowed operators: ' + filteredAttrNode.filter.join(', ') + ')'
                        ].join('')
                    );
                }

                const resolvedFilter = {
                    attribute: filteredAttrNode.map.default,
                    operator: filter.operator,
                    value: filter.value
                };
                let parentFilter = resolvedFilter;

                // resolve filter by sub-resources:
                if (subResourceAttrNodes.length > 0) {
                    let subFilter;
                    if (attrNode.subFilters) {
                        attrNode.subFilters.forEach(_subFilter => {
                            if (filter.attribute.join('.') === _subFilter.attribute.join('.')) {
                                subFilter = _subFilter;
                            }
                        });
                    }

                    if (!subFilter) {
                        throw new RequestError(
                            `Can not filter by sub-resource attribute "${filter.attribute.join('.')}"` +
                                (context.attrPath.length > 0 ? ` (in "${context.attrPath.join('.')}")` : '')
                        );
                    }

                    if (subFilter.filter.indexOf(filter.operator) === -1) {
                        throw new RequestError(
                            `Can not filter by sub-resource attribute "${filter.attribute.join('.')}"` +
                                (context.attrPath.length > 0 ? ` (in "${context.attrPath.join('.')}")` : '') +
                                ` with "${filter.operator}" (allowed operators: ${subFilter.filter.join(', ')})`
                        );
                    }

                    if (subFilter.rewriteTo) {
                        const filterAttrNode = getAttribute(subFilter.rewriteTo, attrNode, context);
                        parentFilter.attribute = filterAttrNode.map.default;
                    } else {
                        let filterContext = context;
                        subResourceAttrNodes.forEach(subResourceAttrNode => {
                            let subFilterTree = {
                                dataSources: subResourceAttrNode.dataSources,
                                attributes: [],
                                filter: null,
                                parentKey: subResourceAttrNode.resolvedParentKey,
                                childKey: subResourceAttrNode.resolvedChildKey
                            };

                            // select childKey from DataSource:
                            subResourceAttrNode.childKey.forEach(childKeyAttrPath => {
                                const childKeyAttrNode = getAttribute(childKeyAttrPath, subResourceAttrNode, context);
                                subFilterTree.attributes.push({
                                    dataSourceMap: childKeyAttrNode.map.default,
                                    attrNode: childKeyAttrNode,
                                    fromDataSource: '#current-primary'
                                });
                            });

                            // modify parent-filter to sub-filter:
                            parentFilter.attribute = subResourceAttrNode.resolvedParentKey;
                            parentFilter.operator = 'equal';
                            delete parentFilter.value;
                            const previousParentFilter = parentFilter;

                            // ... then filter sub-resource by given attribute:
                            parentFilter = {
                                attribute: filteredAttrNode.map.default,
                                operator: filter.operator,
                                value: filter.value
                            };
                            subFilterTree.filter = [[parentFilter]];

                            // handle m:n relations with join-table:
                            if (subResourceAttrNode.joinVia) {
                                const joinViaDataSource = subResourceAttrNode.dataSources[subResourceAttrNode.joinVia];

                                const resolvedJoinParentKey = {};
                                resolvedJoinParentKey[subResourceAttrNode.joinVia] =
                                    joinViaDataSource.resolvedJoinParentKey;
                                const resolvedJoinChildKey = {};
                                resolvedJoinChildKey[subResourceAttrNode.joinVia] =
                                    joinViaDataSource.resolvedJoinChildKey;

                                const joinSubFilterTree = {
                                    dataSources: subResourceAttrNode.dataSources,
                                    primaryName: subResourceAttrNode.joinVia,
                                    attributes: [],
                                    filter: [
                                        [
                                            {
                                                attribute: resolvedJoinChildKey,
                                                operator: 'equal',
                                                valueFromSubFilter: 0
                                            }
                                        ]
                                    ],
                                    parentKey: subFilterTree.parentKey,
                                    childKey: resolvedJoinParentKey
                                };

                                subFilterTree.parentKey = resolvedJoinChildKey;

                                // select joinParentKey from DataSource:
                                joinViaDataSource.joinParentKey.forEach(joinParentKeyAttrPath => {
                                    const joinParentKeyAttrNode = getAttribute(
                                        joinParentKeyAttrPath,
                                        subResourceAttrNode,
                                        context
                                    );
                                    joinSubFilterTree.attributes.push({
                                        dataSourceMap: joinParentKeyAttrNode.map.default,
                                        attrNode: joinParentKeyAttrNode,
                                        fromDataSource: subResourceAttrNode.joinVia
                                    });
                                });

                                // link join-sub-filter in between:
                                joinSubFilterTree.subFilters = [subFilterTree];
                                subFilterTree = joinSubFilterTree;
                            }

                            // link sub-filter to parent:
                            if (!filterContext.resourceTree.subFilters) {
                                filterContext.resourceTree.subFilters = [];
                            }

                            previousParentFilter.valueFromSubFilter = filterContext.resourceTree.subFilters.length;
                            filterContext.resourceTree.subFilters.push(subFilterTree);

                            // switch filter-context:
                            filterContext = Object.assign({}, filterContext);
                            filterContext.resourceTree = subFilterTree;
                        });
                    }
                }

                // TODO: Check type of values

                return resolvedFilter;
            })
        );

        if (context.resourceTree.filter) {
            // generate cross product of OR filters:
            const combinedFilter = [];
            requestFilter.forEach(andFilter => {
                context.resourceTree.filter.forEach(andFilter2 => {
                    combinedFilter.push(cloneDeep(andFilter).concat(cloneDeep(andFilter2)));
                });
            });
            requestFilter = combinedFilter;
        }

        context.resourceTree.filter = requestFilter;
    }

    if ('search' in req) {
        context.resourceTree.search = req.search;
    }

    const order = req.order || attrNode.defaultOrder;
    if (order) {
        context.resourceTree.order = order.map(orderPart => {
            const orderedAttrNode = getAttribute(orderPart.attribute, attrNode, context);

            if (!orderedAttrNode.order) {
                throw new RequestError(
                    [
                        'Attribute "' + orderPart.attribute.join('.') + '" ',
                        context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '") ' : '',
                        'can not be ordered'
                    ].join('')
                );
            }
            if (orderedAttrNode.order.indexOf(orderPart.direction) === -1) {
                throw new RequestError(
                    [
                        'Attribute "' + orderPart.attribute.join('.') + '" ',
                        context.attrPath.length > 0 ? ' (in "' + context.attrPath.join('.') + '")' : '',
                        'can not be ordered "' +
                            orderPart.direction +
                            '" (allowed: ' +
                            orderedAttrNode.order.join(', ') +
                            ')'
                    ].join('')
                );
            }

            // TODO: Check if same resource - implement order by Sub-Resource?

            orderPart = Object.assign({}, orderPart);
            orderPart.attribute = orderedAttrNode.map.default;

            return orderPart;
        });
    }

    let limit = null;
    if ('limit' in req) {
        if (!attrNode.many) {
            throw new RequestError(
                'Invalid limit on a single resource' +
                    (context.attrPath.length > 0 ? ` (in "${context.attrPath.join('.')}")` : '')
            );
        }
        limit = req.limit;
    } else if (attrNode.many) {
        limit = attrNode.defaultLimit || attrNode.maxLimit || (context.isMainResource ? 10 : null);
    }
    if (attrNode.maxLimit) {
        if (limit === null || limit > attrNode.maxLimit) {
            throw new RequestError(
                `Invalid limit ${limit !== null ? limit : 'unlimited'}, maxLimit is ${attrNode.maxLimit}` +
                    (context.attrPath.length > 0 ? ` (in "${context.attrPath.join('.')}")` : '')
            );
        }
    }
    if (limit !== null) {
        context.resourceTree.limit = limit;
        if (!context.isMainResource && context.isMany) {
            context.resourceTree.limitPerGroup = true;
        }
    }

    if ('page' in req) {
        if (!('limit' in req)) {
            throw new RequestError(
                'Always specify a fixed limit when requesting page' +
                    (context.attrPath.length > 0 ? ` (in "${context.attrPath.join('.')}")` : '')
            );
        }

        context.resourceTree.page = req.page;
    }
}

/**
 * Map request against resource-config, validate everything, return a Resource-Tree
 * with prepared DataSource-requests (which will be resolved to the final requests
 * later)
 *
 * @param {Object} req - Part of request at current depth
 * @param {Object} attrNode - Resource-config node at current depth
 * @param {Object} context - "Global" things and context for better error-handling
 * @private
 */
function mapRequestRecursive(req, attrNode, context) {
    if (attrNode.hidden && !req.internal) {
        throw new RequestError(
            ['Unknown attribute "' + context.attrPath.join('.') + '"', 'in request - it is a hidden attribute'].join(
                ' '
            )
        );
    }

    if (attrNode.deprecated && !req.internal) {
        context.deprecated.push(context.attrPath.join('.'));
    }

    if (attrNode.permission || context.authContext) {
        if (!context.auth || !context.auth.check) {
            let attrPath = context.attrPath.join('.');
            throw new ImplementationError(`No valid Auth-Provider available (used in "${attrPath}")`);
        }

        context.authContext = context.auth.check(attrNode, context.authContext);
    }

    if (!req.internal) attrNode.selected = true;

    if (attrNode.dataSources) {
        const subResourceTree = {
            dataSources: attrNode.dataSources,
            attrPath: context.attrPath,
            attrNode,
            attributes: []
        };

        if (attrNode.resourceName) subResourceTree.resourceName = attrNode.resourceName;

        if (attrNode.primaryKey && attrNode.resolvedPrimaryKey) {
            subResourceTree.primaryKey = attrNode.resolvedPrimaryKey;

            // always select primaryKey:
            attrNode.primaryKey.forEach(primaryKeyAttrPath => {
                const primaryKeyAttrNode = getAttribute(primaryKeyAttrPath, attrNode, context);

                if (!primaryKeyAttrNode.hidden && !req.internal) {
                    primaryKeyAttrNode.selected = true;

                    if (attrNode.permission || context.authContext) {
                        if (!context.auth || !context.auth.check) {
                            let attrPath = context.attrPath.concat(primaryKeyAttrPath).join('.');
                            throw new ImplementationError(`No valid Auth-Provider available (used in "${attrPath}")`);
                        }

                        context.auth.check(primaryKeyAttrNode, context.authContext);
                    }
                }

                subResourceTree.attributes.push({
                    dataSourceMap: primaryKeyAttrNode.map.default,
                    attrNode: primaryKeyAttrNode,
                    fromDataSource: '#all-selected'
                });
            });

            context.useRequestError = true;
        }

        let isMainResource = true;

        if (context.resourceTree) {
            isMainResource = false;

            // select parentKey from DataSource:
            subResourceTree.parentKey = attrNode.resolvedParentKey;
            subResourceTree.multiValuedParentKey = false;
            const groupAttrNodes = {
                fromDataSource: '#same-group', // depend on same DataSource for all composite parent-key attributes
                subResourceAttrNode: attrNode,
                attributes: []
            };
            attrNode.parentKey.forEach(parentKeyAttrPath => {
                const parentKeyAttrNode = getAttribute(parentKeyAttrPath, context.resourceTree.attrNode, context);
                groupAttrNodes.attributes.push({
                    dataSourceMap: parentKeyAttrNode.map.default,
                    attrNode: parentKeyAttrNode
                });
                if (parentKeyAttrNode.multiValued && attrNode.parentKey.length === 1) {
                    subResourceTree.multiValuedParentKey = true;
                }
            });
            context.resourceTree.attributes.push(groupAttrNodes);

            // select childKey from DataSource:
            subResourceTree.childKey = attrNode.resolvedChildKey;
            attrNode.childKey.forEach(childKeyAttrPath => {
                const childKeyAttrNode = getAttribute(childKeyAttrPath, attrNode, context);
                subResourceTree.attributes.push({
                    dataSourceMap: childKeyAttrNode.map.default,
                    attrNode: childKeyAttrNode,
                    fromDataSource: '#current-primary'
                });
            });

            // for m:n relations with join-table: pass through joinVia option and select attributes
            if (attrNode.joinVia) {
                subResourceTree.joinVia = attrNode.joinVia;

                const joinDataSource = attrNode.dataSources[attrNode.joinVia];
                ['joinParentKey', 'joinChildKey'].forEach(joinKeyName => {
                    joinDataSource[joinKeyName].forEach(joinKeyAttrPath => {
                        const joinKeyAttrNode = getAttribute(joinKeyAttrPath, attrNode, context);
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
            subResourceTree.filter = [
                [
                    {
                        attribute: subResourceTree.childKey,
                        operator: 'equal',
                        valueFromParentKey: true
                    }
                ]
            ];

            // link Sub-Resource to parent:
            if (!context.resourceTree.children) {
                context.resourceTree.children = [];
            }
            context.resourceTree.children.push(subResourceTree);
        }

        // switch context:
        context = Object.assign({}, context);
        context.resourceTree = subResourceTree;
        context.isMainResource = isMainResource;

        processRequestOptions(req, attrNode, context);

        if (!context.isMany && attrNode.many) {
            context.isMany = true;
        }
    } else {
        if (!context.resourceTree) {
            throw new ImplementationError('No DataSources defined in resource');
        }

        // error handling: only "select" is possible on non-resource-nodes:
        let optionsCount = Object.keys(req).length;
        if ('select' in req) optionsCount--;
        if ('internal' in req) optionsCount--;

        if (optionsCount > 0) {
            throw new RequestError(`Sub-Resource options not possible on "${context.attrPath.join('.')}"`);
        }

        if (attrNode.map) {
            context.resourceTree.attributes.push({ dataSourceMap: attrNode.map.default, attrNode });
        }
    }

    // merge all dependencies (within current resource) into request (with "internal"-flag), before
    // we call ourself recursive, because this function is not designed to be called multiple times
    // for the same attrNode:
    if (attrNode.dataSources) resolveDependencies(req, attrNode, context);

    // tree recursion:
    if (req.select) {
        const subContext = Object.assign({}, context);

        Object.keys(req.select).forEach(subAttrName => {
            const subAttrNode = getAttribute([subAttrName], attrNode, context);
            subContext.attrPath = context.attrPath.concat([subAttrName]);

            mapRequestRecursive(req.select[subAttrName], subAttrNode, subContext);
        });
    }

    return context.resourceTree;
}

/**
 * @param resourceTree
 * @returns {string}
 * @private
 */
function selectPrimaryDataSource(resourceTree) {
    let primaryName = 'primary';

    if (resourceTree.primaryName) {
        primaryName = resourceTree.primaryName;
    } else if ('search' in resourceTree) {
        // select primary DataSource for searching (maybe other than "primary"):
        primaryName = Object.keys(resourceTree.dataSources).find(
            dataSourceName => resourceTree.dataSources[dataSourceName].searchable
        );

        if (typeof primaryName === 'undefined') throw new RequestError('Resource does not support fulltext-search');
    }

    return primaryName;
}

/**
 * Distribute attributes over DataSources.
 *
 * @private
 */
function resolveDataSourceAttributes(resourceTree, dataSources, primaryName) {
    Object.keys(dataSources).forEach(dataSourceName => {
        const dataSource = dataSources[dataSourceName];
        dataSource.attributes = [];
        dataSource.attributeOptions = {};
    });

    resourceTree.attributes.forEach(function resolveAttribute(attrInfo) {
        let selectedDataSources;

        if (attrInfo.fromDataSource === '#same-group') {
            return attrInfo.attributes.forEach(resolveAttribute); // handle key-groups as flat
        }

        if (attrInfo.fromDataSource === '#all-selected') {
            attrInfo.attrNode.selectedDataSource = primaryName;
            selectedDataSources = [];
            Object.keys(dataSources).forEach(dataSourceName => {
                if (dataSources[dataSourceName].joinParentKey) return;
                selectedDataSources.push(dataSourceName);
            });
        } else if (attrInfo.fromDataSource === '#current-primary') {
            attrInfo.attrNode.selectedDataSource = primaryName;
            selectedDataSources = [attrInfo.attrNode.selectedDataSource];
        } else if (attrInfo.fromDataSource) {
            attrInfo.attrNode.selectedDataSource = attrInfo.fromDataSource;
            selectedDataSources = [attrInfo.attrNode.selectedDataSource];
        } else {
            attrInfo.attrNode.selectedDataSource = Object.keys(attrInfo.dataSourceMap).find(
                dataSourceName => dataSources[dataSourceName]
            );

            if (!attrInfo.attrNode.selectedDataSource) {
                throw new ImplementationError(
                    'No proper DataSource selected for attribute ' +
                        '(this should not happen - bug in request-resolver in Flora core)'
                );
            }
            selectedDataSources = [attrInfo.attrNode.selectedDataSource];
        }

        selectedDataSources.forEach(selectedDataSourceName => {
            const attribute = attrInfo.dataSourceMap[selectedDataSourceName];
            dataSources[selectedDataSourceName].attributes.push(attribute);
            dataSources[selectedDataSourceName].attributeOptions[attribute] = _.pick(attrInfo.attrNode, [
                'type',
                'storedType',
                'multiValued',
                'delimiter'
            ]);
        });

        return null;
    });

    Object.keys(dataSources).forEach(dataSourceName => {
        dataSources[dataSourceName].attributes = _.uniq(dataSources[dataSourceName].attributes);
    });
}

/**
 * Process options: filter, search, order, limit, page and finally resolve them to
 * primary DataSource.
 *
 * @private
 */
function resolveDataSourceOptions(resourceTree, dataSources, primaryName) {
    if (resourceTree.filter) {
        dataSources[primaryName].filter = resourceTree.filter.map(andFilter =>
            andFilter.map(filter => {
                if (!filter.attribute[primaryName]) {
                    throw new ImplementationError('All filtered attributes must be mapped to primary DataSource');
                }

                filter.attribute = filter.attribute[primaryName];
                if (filter.attribute.length === 1) {
                    filter.attribute = filter.attribute[0];
                }

                return filter;
            })
        );
    }

    if ('search' in resourceTree) {
        dataSources[primaryName].search = resourceTree.search;
    }

    if (resourceTree.order) {
        dataSources[primaryName].order = resourceTree.order.map(order => {
            if (!order.attribute[primaryName]) {
                throw new ImplementationError('All ordered attributes must be mapped to primary DataSource');
            }

            order.attribute = order.attribute[primaryName];

            return order;
        });
    }

    // TODO: Allow filter/order in different than the primary DataSource?

    if (has(resourceTree, 'limit')) {
        dataSources[primaryName].limit = resourceTree.limit;
    }

    if (resourceTree.limitPerGroup && resourceTree.childKey) {
        const limitPer = resourceTree.childKey[primaryName];
        dataSources[primaryName].limitPer = limitPer.length === 1 ? limitPer[0] : limitPer;
    }

    if (resourceTree.page) {
        dataSources[primaryName].page = resourceTree.page;
    }
}

/**
 * Resolve Resource-Tree with prepared DataSource-requests to the final DataSource-Tree,
 * resolve dependencies and drop redundant DataSources.
 *
 * @private
 */
function resolveResourceTree(resourceTree, parentDataSourceName) {
    const dataSources = {};
    const primaryName = selectPrimaryDataSource(resourceTree);

    if (resourceTree.attrNode) {
        resourceTree.attrNode.primaryDataSource = primaryName;
    }

    // determine needed DataSources (simple logic - to be optimized for complex cases):
    dataSources[primaryName] = true;
    resourceTree.attributes.forEach(attrInfo => {
        if (attrInfo.fromDataSource === '#all-selected' || attrInfo.fromDataSource === '#current-primary') return;

        // handle key-group (select all attributes of one composite key from same DataSource):
        if (attrInfo.fromDataSource === '#same-group') {
            let selectedDataSource = primaryName;
            const possibleDataSources = Object.keys(attrInfo.subResourceAttrNode.resolvedParentKey);

            if (possibleDataSources.indexOf(selectedDataSource) === -1) {
                // just select first possible one - optimize?
                selectedDataSource = possibleDataSources[0];
                attrInfo.subResourceAttrNode.parentDataSource = selectedDataSource;
            }

            attrInfo.attributes.forEach(groupAttrInfo => {
                groupAttrInfo.fromDataSource = selectedDataSource;
            });

            dataSources[selectedDataSource] = true;
            return;
        }

        dataSources[Object.keys(attrInfo.dataSourceMap)[0]] = true;
    });

    // initialize needed DataSources:
    Object.keys(dataSources).forEach(dataSourceName => {
        dataSources[dataSourceName] = Object.assign({}, resourceTree.dataSources[dataSourceName]);
    });
    if (resourceTree.attrNode) {
        resourceTree.attrNode.dataSources = dataSources; // for use in result-builder
    }

    resolveDataSourceAttributes(resourceTree, dataSources, primaryName);
    resolveDataSourceOptions(resourceTree, dataSources, primaryName);

    let dataSourceTree = {};
    if (resourceTree.attrPath) {
        dataSourceTree.attributePath = resourceTree.attrPath;
        dataSourceTree.dataSourceName = primaryName;
    }

    dataSourceTree.request = dataSources[primaryName];
    dataSourceTree.attributeOptions = dataSourceTree.request.attributeOptions;
    delete dataSourceTree.request.attributeOptions;

    if (resourceTree.resourceName) dataSourceTree.resourceName = resourceTree.resourceName;

    if (parentDataSourceName && resourceTree.parentKey && resourceTree.childKey) {
        if (!resourceTree.parentKey[parentDataSourceName]) {
            throw new ImplementationError(
                [
                    'Parent key' + (resourceTree.attrPath ? ' of "' + resourceTree.attrPath.join('.') + '"' : ''),
                    'not in "' + parentDataSourceName + '"-DataSource of parent resource'
                ].join(' ')
            );
        }

        dataSourceTree.parentKey = resourceTree.parentKey[parentDataSourceName];
        dataSourceTree.childKey = resourceTree.childKey[primaryName];
        if ('multiValuedParentKey' in resourceTree && 'uniqueChildKey' in resourceTree) {
            dataSourceTree.multiValuedParentKey = resourceTree.multiValuedParentKey;
            dataSourceTree.uniqueChildKey = resourceTree.uniqueChildKey;
        }
    }

    // append secondary DataSources:
    const secondaryDataSources = {};

    Object.keys(dataSources).forEach(dataSourceName => {
        if (dataSourceName === primaryName) return;
        if (dataSources[dataSourceName].joinParentKey) return;

        if (!dataSourceTree.subRequests) {
            dataSourceTree.subRequests = [];
        }

        const filter = {
            attribute: resourceTree.primaryKey[dataSourceName],
            operator: 'equal',
            valueFromParentKey: true
        };

        if (filter.attribute.length === 1) {
            filter.attribute = filter.attribute[0];
        }

        dataSources[dataSourceName].filter = [[filter]];

        const subRequest = {
            attributePath: resourceTree.attrPath,
            dataSourceName,
            parentKey: resourceTree.primaryKey[primaryName],
            childKey: resourceTree.primaryKey[dataSourceName],
            multiValuedParentKey: false,
            uniqueChildKey: true,
            request: dataSources[dataSourceName]
        };

        subRequest.attributeOptions = subRequest.request.attributeOptions;
        delete subRequest.request.attributeOptions;

        dataSourceTree.subRequests.push(subRequest);
        // also index by name to resolve dependencies later
        secondaryDataSources[dataSourceName] = subRequest;
    });

    if (resourceTree.subFilters) {
        resourceTree.subFilters.forEach(subFilterTree => {
            const subDataSourceTree = resolveResourceTree(subFilterTree, primaryName);

            if (!dataSourceTree.subFilters) {
                dataSourceTree.subFilters = [];
            }
            dataSourceTree.subFilters.push(subDataSourceTree);
        });
    }

    if (resourceTree.children) {
        resourceTree.children.forEach(subResourceTree => {
            let parentDataSourceTree = dataSourceTree;
            let dataSourceName = primaryName;

            // check if we depend on a secondary DataSource:
            if (
                subResourceTree.attrNode.parentDataSource &&
                dataSourceName !== subResourceTree.attrNode.parentDataSource
            ) {
                dataSourceName = subResourceTree.attrNode.parentDataSource;
                parentDataSourceTree = secondaryDataSources[dataSourceName];
            }

            const subDataSourceTree = resolveResourceTree(subResourceTree, dataSourceName);

            if (!parentDataSourceTree.subRequests) {
                parentDataSourceTree.subRequests = [];
            }
            parentDataSourceTree.subRequests.push(subDataSourceTree);
        });
    }

    // handle m:n relations with join-table (insert an additional request into
    // the tree and move the original request one level deeper):
    if (resourceTree.joinVia) {
        const joinDataSource = dataSources[resourceTree.joinVia];
        joinDataSource.filter = [
            [
                {
                    attribute:
                        joinDataSource.resolvedJoinParentKey.length === 1
                            ? joinDataSource.resolvedJoinParentKey[0]
                            : joinDataSource.resolvedJoinParentKey,
                    operator: 'equal',
                    valueFromParentKey: true
                }
            ]
        ];

        const originalDataSourceTree = dataSourceTree;
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
 * This is where the magic happens.
 *
 * @param {Request} req
 * @param resourceConfigs
 * @return {Object}
 */
module.exports = function requestResolver(req, resourceConfigs) {
    if (!req.resource) throw new RequestError('Resource not specified in request');

    // init recursion:
    const resolvedConfig = { resource: req.resource, many: true };
    const context = {
        resourceConfigs,
        resourceTree: null,
        isMainResource: true,
        isMany: false, // are we inside a many="true" ressource/relation (for limit handling)
        attrPath: [],
        deprecated: [],
        auth: req._auth,
        authContext: null
    };

    resolveIncludes(resolvedConfig, context);
    const resourceTree = mapRequestRecursive(req, resolvedConfig, context);
    const dataSourceTree = resolveResourceTree(resourceTree);

    return { resolvedConfig, dataSourceTree, deprecated: context.deprecated };
};

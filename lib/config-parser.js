'use strict';

const requestParser = require('@florajs/request-parser');
const { ImplementationError } = require('@florajs/errors');

/**
 * @param optionsContext
 * @param context
 * @return {string}
 * @private
 */
function getErrorContext(optionsContext, context) {
    return (
        ` in ${optionsContext} "${context.resourceName}:` +
        (context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}') +
        '"'
    );
}

/**
 * @param array
 * @param value
 * @return {*}
 * @private
 */
function removeValue(array, value) {
    const index = array.indexOf(value);
    if (index !== -1) return array.splice(index, 1)[0];
    return null;
}

/**
 * Meta function which calls the defined parsers for current node and fails
 * on additionally defined options.
 *
 * @private
 */
function parseNode(attrNode, parsers, context) {
    const attrNames = Object.keys(attrNode);
    const errorContext = context.errorContext;

    Object.keys(parsers).forEach((attrName) => {
        const parser = parsers[attrName];

        context.errorContext = ` (option "${attrName}"${errorContext})`;
        removeValue(attrNames, attrName);

        if (attrName in attrNode && parser !== null) {
            attrNode[attrName] = parser(attrNode[attrName], context);
        }
    });

    context.errorContext = errorContext;

    if (attrNames.length > 0) {
        throw new ImplementationError(`Invalid option "${attrNames.join(', ')}"${context.errorContext}`);
    }
}

/**
 * Generates an error for invalid identifier strings. Identifiers contain letters,
 * numbers and underscore - and do not start with a number.
 *
 * @private
 */
function checkIdentifier(str, context) {
    if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(str)) {
        throw new ImplementationError(`Invalid identifier "${str}"${context.errorContext}`);
    }
    return str;
}

/**
 * Parses "id", "meta.id".
 *
 * @private
 */
function parseAttributePath(attrPath, context) {
    const parsed = attrPath.split('.');
    parsed.forEach((item) => checkIdentifier(item, context));
    return parsed;
}

/**
 * Parses "id", "meta.id,meta.context".
 *
 * @private
 */
function parsePrimaryKey(attrPathList, context) {
    return attrPathList.split(',').map((attrPath) => parseAttributePath(attrPath, context));
}

/**
 * Parses "{primary}", "id", "meta.id,meta.context".
 *
 * @private
 */
function parseRelationKey(relationKey, context) {
    if (relationKey === '{primary}') return null;
    return parsePrimaryKey(relationKey, context);
}

/**
 * Parses "id", "id;fulltextSearch:articleId;articleBody:articleId".
 * Null generates default-mapping to primary DataSource from context.subAttrPath.
 * AST supports multiple mapping types - currently not implemented in syntax.
 *
 * @private
 */
function parseMap(map, context) {
    const parsed = { default: {} };
    const primaryName = 'primary';

    if (map === null) {
        parsed.default[primaryName] = context.subAttrPath.join('.');
    } else {
        map.split(';').forEach((part) => {
            const parts = part.split(':', 2);
            const dataSource = parts.length < 2 ? primaryName : parts.shift();
            parsed.default[dataSource] = parts[0];
        });
    }
    return parsed;
}

/**
 * Validates string against whitelist.
 *
 * @private
 */
function checkWhitelist(str, whitelist, context) {
    if (whitelist.indexOf(str) === -1) {
        throw new ImplementationError(
            'Invalid "' + str + '" (allowed: ' + whitelist.join(', ') + ')' + context.errorContext
        );
    }
    return str;
}

/**
 * @private
 */
function parseType(type, context) {
    return checkWhitelist(
        type,
        ['string', 'int', 'float', 'boolean', 'date', 'datetime', 'time', 'raw', 'object', 'json'],
        context
    );
}

/**
 * Parses a list of comma-separated strings and validates them against whitelist.
 *
 * @private
 */
function parseList(list, whitelist, context) {
    const parsed = list.split(',');
    parsed.forEach((item) => checkWhitelist(item, whitelist, context));
    return parsed;
}

/**
 * Parses "true", "equal,notEqual,greater,greaterOrEqual,less,lessOrEqual,like,between,notBetween".
 *
 * "true" defaults to "equal".
 *
 * @private
 */
function parseFilter(filter, context) {
    if (filter === true || filter === 'true') return ['equal'];
    return parseList(
        filter,
        ['equal', 'notEqual', 'greater', 'greaterOrEqual', 'less', 'lessOrEqual', 'like', 'between', 'notBetween'],
        context
    );
}

/**
 * Parses "true", "asc,desc,random,topflop".
 *
 * "true" defaults to "asc,desc".
 *
 * @private
 */
function parseOrder(order, context) {
    if (order === true || order === 'true') return ['asc', 'desc'];
    return parseList(order, ['asc', 'desc', 'random', 'topflop'], context);
}

/**
 * Parses "null" to null, other strings are passed through.
 *
 * @private
 */
function parseStaticValue(value /* , context */) {
    return value === 'null' ? null : value;
}

/**
 * Parses "true", true, "false", false.
 *
 * @private
 */
function parseBoolean(value, context) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new ImplementationError(`Invalid boolean value "${value}"${context.errorContext}`);
}

/**
 * Parses a storedType value.
 * Example:
 * - "datetime"
 * - "datetime(timezone=Europe/Berlin)"
 * - "datetime(timezone=Europe/Berlin;foo=bar)"
 *
 * @private
 */
function parseStoredType(value /* , context */) {
    const regex = /^(\w+)(\((.*?)\))?$/;
    const result = value.match(regex);
    if (!result) throw new ImplementationError(`Invalid storedType "${value}"`);

    const type = result[1];
    const options = {};
    if (result[2]) {
        const regexOptions = /^(\w+)=(.*)/;
        result[3].split(';').forEach((o) => {
            const resultOptions = o.match(regexOptions);
            if (!resultOptions) throw new ImplementationError(`Invalid storedType "${value}"`);
            options[resultOptions[1]] = resultOptions[2];
        });
    }

    return { type, options };
}

/**
 * Parses integer values
 *
 * @private
 */
function parseInteger(value /* , context */) {
    return parseInt(value, 10);
}

function parseDepends(value, context) {
    try {
        return requestParser.select(value, { enableBraces: true });
    } catch (err) {
        throw new ImplementationError(err.message + context.errorContext);
    }
}

function checkResourceName(name, context) {
    if (!/^[a-zA-Z_][a-zA-Z_\-0-9/]*$/.test(name)) {
        throw new ImplementationError(`Invalid resource name "${name}"${context.errorContext}`);
    }
    return name;
}

/**
 * Parses attribute/filter of subFilters.
 *
 * @private
 */
function parseSubFilters(subFilters, context) {
    subFilters.forEach((subFilter) =>
        parseNode(
            subFilter,
            {
                attribute: parseAttributePath,
                filter: parseFilter,
                rewriteTo: parseAttributePath
            },
            context
        )
    );
    return subFilters;
}

/**
 * @private
 */
function parseInherit(inherit, context) {
    return checkWhitelist(inherit, ['inherit', 'replace'], context);
}

/**
 * Handle special cases and checks for options in resource context.
 *
 * @private
 */
function handleResourceContext(attrNode, context) {
    let dataSource;
    let lastDataSourceName;

    const errorContext = context.errorContext;

    if (attrNode.resource) {
        if ('subFilters' in attrNode) {
            throw new ImplementationError(
                'Adding subFilters for included sub-resource is not allowed' + context.errorContext
            );
        }
        if ('primaryKey' in attrNode) {
            throw new ImplementationError(
                'Overwriting primaryKey for included sub-resource is not allowed' + context.errorContext
            );
        }
    } else if (!('primaryKey' in attrNode)) {
        throw new ImplementationError('Missing primaryKey' + context.errorContext);
    }

    if (attrNode.dataSources) {
        Object.keys(attrNode.dataSources).forEach((dataSourceName) => {
            lastDataSourceName = dataSourceName;
            context.dataSourceAttributes[dataSourceName] = [];

            dataSource = attrNode.dataSources[dataSourceName];

            if (dataSource.inherit) {
                if (!attrNode.resource) {
                    throw new ImplementationError(
                        `DataSource "${dataSourceName}" is defined as "inherit" but has no included resource`
                    );
                }
                context.errorContext = ' in inherit' + errorContext;
                dataSource.inherit = checkWhitelist(dataSource.inherit, ['true', 'inherit', 'replace'], context);
                if (dataSource.inherit === 'true') {
                    dataSource.inherit = 'inherit';
                }
                context.errorContext = errorContext;
            }

            if (!dataSource.type && !dataSource.inherit) {
                throw new ImplementationError(
                    `DataSource "${dataSourceName}" misses "type" option${context.errorContext}`
                );
            }

            if (dataSource.joinParentKey) {
                context.errorContext = ' in joinParentKey' + errorContext;
                dataSource.joinParentKey = parsePrimaryKey(dataSource.joinParentKey, context);
                context.errorContext = errorContext;
            }

            if (dataSource.joinChildKey) {
                context.errorContext = ' in joinChildKey' + errorContext;
                dataSource.joinChildKey = parsePrimaryKey(dataSource.joinChildKey, context);
                context.errorContext = errorContext;
            }
        });
    }

    if (attrNode.joinVia) {
        if (!attrNode.dataSources[attrNode.joinVia]) {
            throw new ImplementationError(`Unknown DataSource "${attrNode.joinVia}" in joinVia` + context.errorContext);
        } else {
            dataSource = attrNode.dataSources[attrNode.joinVia];

            if (!dataSource.joinParentKey) {
                throw new ImplementationError(
                    `DataSource "${lastDataSourceName}" misses "joinParentKey" option` + context.errorContext
                );
            }

            if (!dataSource.joinChildKey) {
                throw new ImplementationError(
                    `DataSource "${lastDataSourceName}" misses "joinChildKey" option` + context.errorContext
                );
            }
        }
    }
}

/**
 * Handle special cases and checks for options in attribute context.
 *
 * @private
 */
function handleAttributeContext(attrNode, context) {
    if (!attrNode.type && attrNode.inherit !== 'inherit') attrNode.type = 'string';

    if (attrNode.map) {
        Object.keys(attrNode.map).forEach((mappingName) => {
            const mapping = attrNode.map[mappingName];

            Object.keys(mapping).forEach((dataSourceName) => {
                if (!context.dataSourceAttributes[dataSourceName]) {
                    throw new ImplementationError(
                        `Unknown DataSource "${dataSourceName}" in map${context.errorContext}`
                    );
                }

                context.dataSourceAttributes[dataSourceName].push(mapping[dataSourceName]);
            });
        });

        if ('value' in attrNode) {
            throw new ImplementationError(
                'Static "value" in combination with "map" makes no sense' + context.errorContext
            );
        }
    }
}

/**
 * Resolve attribute path inside current (sub-)resource relative to attrNode
 * and return child attrNode.
 *
 * @private
 */
function getLocalAttribute(path, attrNode, context) {
    path.forEach((attributeName) => {
        if (!attrNode.attributes || !attrNode.attributes[attributeName]) {
            throw new ImplementationError(`Unknown attribute "${path.join('.')}"${context.errorContext}`);
        }

        attrNode = attrNode.attributes[attributeName];

        if (attrNode.dataSources || attrNode.resource) {
            throw new ImplementationError(`Path "${path.join('.')}" references sub-resource${context.errorContext}`);
        }
    });

    return attrNode;
}

/**
 * Resolve key attributes per DataSource.
 *
 * @private
 */
function resolveKey(key, attrNode, options, context) {
    const resolvedKey = {};

    key.forEach((keyAttrPath) => {
        const keyAttrNode = getLocalAttribute(keyAttrPath, attrNode, context);

        if (keyAttrNode.multiValued) {
            if (!options.allowMultiValued) {
                throw new ImplementationError(
                    `Key attribute "${keyAttrPath.join('.')}" ` + `must not be multiValued${context.errorContext}`
                );
            }
            if (key.length > 1) {
                throw new ImplementationError(
                    `Composite key attribute "${keyAttrPath.join('.')}" ` +
                        `must not be multiValued${context.errorContext}`
                );
            }
        }

        if (keyAttrNode.map) {
            Object.keys(keyAttrNode.map.default).forEach((dataSourceName) => {
                if (!resolvedKey[dataSourceName]) resolvedKey[dataSourceName] = [];
                resolvedKey[dataSourceName].push(keyAttrNode.map.default[dataSourceName]);
            });
        }

        if (options.neededDataSources) {
            options.neededDataSources.forEach((neededDataSource) => {
                if (!keyAttrNode.map || !keyAttrNode.map.default[neededDataSource]) {
                    throw new ImplementationError(
                        `Key attribute "${keyAttrPath.join('.')}" ` +
                            `is not mapped to "${neededDataSource}" DataSource${context.errorContext}`
                    );
                }
            });
        }
    });

    // remove DataSources with incomplete keys:
    Object.keys(resolvedKey).forEach((dataSourceName) => {
        if (resolvedKey[dataSourceName].length !== key.length) {
            delete resolvedKey[dataSourceName];
        }
    });

    if (Object.keys(resolvedKey).length < 1) {
        throw new ImplementationError('Key is not mappable to a single DataSource' + context.errorContext);
    }

    return resolvedKey;
}

/**
 * Recursive iteration over one resource to check and resolve parentKey/childKey.
 *
 * @param {Object} attrNode
 * @param {Object} context
 * @private
 */
function resolveRelations(attrNode, context) {
    if (attrNode.dataSources || attrNode.resource) {
        const parentResource = context.parentResource;
        let childResource = attrNode;

        context.errorContext = getErrorContext(!parentResource ? 'resource' : 'sub-resource', context);

        if (attrNode.resource) {
            if (!context.resourceConfigs[attrNode.resource]) {
                throw new ImplementationError('Unknown resource "' + attrNode.resource + '"' + context.errorContext);
            }
            childResource = context.resourceConfigs[attrNode.resource].config;
        }

        if (parentResource) {
            if (!('parentKey' in attrNode)) throw new ImplementationError('Missing parentKey' + context.errorContext);
            if (!('childKey' in attrNode)) throw new ImplementationError('Missing childKey' + context.errorContext);

            if (attrNode.parentKey === null) {
                attrNode.parentKey = structuredClone(parentResource.primaryKey);
            }
            if (attrNode.childKey === null) {
                attrNode.childKey = structuredClone(childResource.primaryKey);
            }

            if (attrNode.joinVia) {
                const joinViaDataSource = attrNode.dataSources[attrNode.joinVia];
                if (attrNode.parentKey.length !== joinViaDataSource.joinParentKey.length) {
                    throw new ImplementationError(
                        'Composite key length of parentKey (' +
                            attrNode.parentKey.length +
                            ') does not match joinParentKey length (' +
                            joinViaDataSource.joinParentKey.length +
                            ') ' +
                            'of DataSource "' +
                            attrNode.joinVia +
                            '"' +
                            context.errorContext
                    );
                }
                if (attrNode.childKey.length !== joinViaDataSource.joinChildKey.length) {
                    throw new ImplementationError(
                        'Composite key length of childKey (' +
                            attrNode.childKey.length +
                            ') does not match joinChildKey length (' +
                            joinViaDataSource.joinChildKey.length +
                            ') ' +
                            'of DataSource "' +
                            attrNode.joinVia +
                            '"' +
                            context.errorContext
                    );
                }
            } else if (attrNode.parentKey.length !== attrNode.childKey.length) {
                throw new ImplementationError(
                    'Composite key length of parentKey (' +
                        attrNode.parentKey.length +
                        ') does not match childKey length (' +
                        attrNode.childKey.length +
                        ')' +
                        context.errorContext
                );
            }

            const errorContext = context.errorContext;
            context.errorContext = ' in parentKey' + errorContext;
            attrNode.resolvedParentKey = resolveKey(
                attrNode.parentKey,
                parentResource,
                {
                    allowMultiValued: true
                },
                context
            );

            context.errorContext = ' in childKey' + errorContext;
            attrNode.resolvedChildKey = resolveKey(
                attrNode.childKey,
                childResource,
                {
                    neededDataSources: ['primary'],
                    allowMultiValued: true
                },
                context
            );
            context.errorContext = errorContext;
        }

        context.parentResource = childResource;
    }

    if (attrNode.attributes) {
        Object.keys(attrNode.attributes).forEach((subAttrName) => {
            const subAttrNode = attrNode.attributes[subAttrName];
            const subContext = Object.assign({}, context);
            subContext.attrPath = context.attrPath.concat([subAttrName]);

            resolveRelations(subAttrNode, subContext);
        });
    }
}

/**
 * Call prepare() on all DataSources and pass them all collected possible attributes.
 *
 * @private
 */
function prepareDataSources(attrNode, context) {
    Object.keys(attrNode.dataSources).forEach((dataSourceName) => {
        const dataSource = attrNode.dataSources[dataSourceName];

        // DataSources with inherit="true" may have no type - so no prepare here:
        if (!dataSource.type) return;

        let dataSourceAttributes = context.dataSourceAttributes[dataSourceName];
        const dataSourceInstance = context.dataSources[dataSource.type];

        if (!dataSourceInstance) {
            throw new ImplementationError('Invalid DataSource type "' + dataSource.type + '"' + context.errorContext);
        }

        if (dataSource.joinParentKey && dataSource.joinChildKey) {
            const errorContext = context.errorContext;
            context.errorContext = ' in joinParentKey' + errorContext;
            dataSource.resolvedJoinParentKey = resolveKey(
                dataSource.joinParentKey,
                attrNode,
                {
                    neededDataSources: [dataSourceName],
                    allowMultiValued: false
                },
                context
            );
            dataSource.resolvedJoinParentKey = dataSource.resolvedJoinParentKey[dataSourceName];

            context.errorContext = ' in joinChildKey' + errorContext;
            dataSource.resolvedJoinChildKey = resolveKey(
                dataSource.joinChildKey,
                attrNode,
                {
                    neededDataSources: [dataSourceName],
                    allowMultiValued: false
                },
                context
            );
            dataSource.resolvedJoinChildKey = dataSource.resolvedJoinChildKey[dataSourceName];
            context.errorContext = errorContext;
        }

        // make attributes unique:
        dataSourceAttributes = dataSourceAttributes.filter((value, index, self) => self.indexOf(value) === index);

        try {
            dataSourceInstance.prepare(dataSource, dataSourceAttributes);
        } catch (err) {
            err.message += context.errorContext;
            throw err;
        }
    });
}

/**
 * Resolve primaryKey per DataSource and fail if not all DataSources have the complete primaryKey.
 * Enable "equal" filter for visible non-composite primary keys by default.
 *
 * @private
 */
function resolvePrimaryKey(attrNode, context) {
    const errorContext = context.errorContext;
    context.errorContext = ' in primaryKey' + errorContext;

    const neededDataSources = [];

    Object.keys(attrNode.dataSources).forEach((dataSourceName) => {
        if (attrNode.dataSources[dataSourceName].joinParentKey) return;
        neededDataSources.push(dataSourceName);
    });

    attrNode.resolvedPrimaryKey = resolveKey(
        attrNode.primaryKey,
        attrNode,
        {
            neededDataSources,
            allowMultiValued: false
        },
        context
    );

    // enable "equal" filter:
    attrNode.primaryKey.forEach((primaryKeyAttrPath) => {
        const primaryKeyAttrNode = getLocalAttribute(primaryKeyAttrPath, attrNode, context);

        if (!primaryKeyAttrNode.filter && attrNode.primaryKey.length === 1) {
            if (!primaryKeyAttrNode.hidden) {
                primaryKeyAttrNode.filter = ['equal'];
            }
        }
    });

    context.errorContext = errorContext;
}

/**
 * Recursive iteration over one resource.
 *
 * @param {Object} attrNode
 * @param {Object} context
 * @private
 */
function processNode(attrNode, context) {
    const isMainResource = context.attrPath.length === 0;

    // identify/handle options-contexts: resource/sub-resource, nested-attribute, attribute:
    if (attrNode.dataSources || attrNode.resource || isMainResource) {
        context.errorContext = getErrorContext(isMainResource ? 'resource' : 'sub-resource', context);
        context.subAttrPath = [];
        context.dataSourceAttributes = {};

        if (isMainResource) {
            parseNode(
                attrNode,
                {
                    dataSources: null,
                    subFilters: parseSubFilters,
                    resource: checkResourceName,
                    primaryKey: parsePrimaryKey,
                    depends: parseDepends,
                    deprecated: parseBoolean,
                    permission: null,
                    attributes: null,
                    defaultLimit: parseInteger,
                    maxLimit: parseInteger,
                    defaultOrder: requestParser.order
                },
                context
            );
        } else {
            parseNode(
                attrNode,
                {
                    dataSources: null,
                    subFilters: parseSubFilters,
                    resource: checkResourceName,
                    primaryKey: parsePrimaryKey,
                    parentKey: parseRelationKey,
                    childKey: parseRelationKey,
                    many: parseBoolean,
                    depends: parseDepends,
                    hidden: parseBoolean,
                    deprecated: parseBoolean,
                    permission: null,
                    joinVia: checkIdentifier,
                    attributes: null,
                    defaultLimit: parseInteger,
                    maxLimit: parseInteger,
                    defaultOrder: requestParser.order
                },
                context
            );
        }

        handleResourceContext(attrNode, context);
    } else if (attrNode.attributes) {
        context.errorContext = getErrorContext('nested-attribute', context);

        parseNode(
            attrNode,
            {
                depends: parseDepends,
                hidden: parseBoolean,
                deprecated: parseBoolean,
                permission: null,
                attributes: null
            },
            context
        );

        // no context-specific special-cases for nested-attributes
    } else {
        context.errorContext = getErrorContext('attribute', context);

        // prepare standard-mapping - except for fixed values and inherited attributes:
        if (!attrNode.map && !('value' in attrNode) && attrNode.inherit !== 'inherit') {
            attrNode.map = null; // "null" means "set standard-mapping in parseMap()"
        }

        parseNode(
            attrNode,
            {
                type: parseType,
                multiValued: parseBoolean,
                storedType: parseStoredType,
                delimiter: null,
                map: parseMap,
                filter: parseFilter,
                order: parseOrder,
                value: parseStaticValue,
                depends: parseDepends,
                hidden: parseBoolean,
                deprecated: parseBoolean,
                permission: null,
                inherit: parseInherit
            },
            context
        );

        handleAttributeContext(attrNode, context);
    }

    // recursion:
    if (attrNode.attributes) {
        Object.keys(attrNode.attributes).forEach((subAttrName) => {
            const subAttrNode = attrNode.attributes[subAttrName];

            const subContext = Object.assign({}, context);
            subContext.attrPath = context.attrPath.concat([subAttrName]);
            subContext.subAttrPath = context.subAttrPath.concat([subAttrName]);

            processNode(subAttrNode, subContext);
        });
    }

    if (attrNode.dataSources) {
        if (attrNode.primaryKey) resolvePrimaryKey(attrNode, context);
        prepareDataSources(attrNode, context);
    }
}

/**
 * Parse and prepare resource configurations loaded by config-loader. Parse
 * options to final object tree. Validate as much as possible. Call prepare()
 * for every defined data source.
 *
 * @param {Object}  resourceConfigs - Complete resourceConfigs tree
 * @param {Object}  dataSources     - Instances of dataSources (per type)
 */
module.exports = function configParser(resourceConfigs, dataSources) {
    const context = {
        dataSources,
        resourceName: null,
        attrPath: [], // current path from root
        subAttrPath: [], // current path inside a sub-resource
        dataSourceAttributes: null, // collect all possible attributes per DataSource
        errorContext: '' // for better error handling
    };

    Object.keys(resourceConfigs).forEach((resourceName) => {
        context.resourceName = resourceName;
        if (resourceConfigs[resourceName].config) {
            processNode(resourceConfigs[resourceName].config, context);
        }
    });

    context.resourceConfigs = resourceConfigs;
    Object.keys(resourceConfigs).forEach((resourceName) => {
        context.resourceName = resourceName;
        context.parentResource = null;
        if (resourceConfigs[resourceName].config) {
            resolveRelations(resourceConfigs[resourceName].config, context);
        }
    });
};

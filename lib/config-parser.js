/**
 * @module config-parser
 */
'use strict';

var _ = require('lodash');
var ImplementationError = require('flora-errors').ImplementationError;

/**
 * Parse and prepare resource configurations loaded by config-loader. Parse
 * options to final object tree. Validate as much as possible. Call prepare()
 * for every defined data source.
 *
 * @param {Object}  resourceConfigs - Complete resourceConfigs tree from {@link module:config-loader|config-loader}
 * @param {Object}  dataSources     - Instances of dataSources (per type)
 */
module.exports = function configParser(resourceConfigs, dataSources) {
    var resourceName;
    var context = {
        dataSources: dataSources,
        resourceName: null,
        attrPath: [], // current path from root
        subAttrPath: [], // current path inside a sub-resource
        dataSourceAttributes: null, // collect all possible attributes per DataSource
        errorContext: '' // for better error handling
    };

    for (resourceName in resourceConfigs) {
        context.resourceName = resourceName;
        processNode(resourceConfigs[resourceName], context);
    }
};

/**
 * Recursive iteration over one resource.
 *
 * @param {Object} attrNode
 * @param {Object} context
 * @private
 */
function processNode(attrNode, context) {
    var subAttrName, subAttrNode, subContext;
    var isMainResource = context.attrPath.length === 0;

    // identify/handle options-contexts: resource/sub-resource, nested-attribute, attribute:
    if (attrNode.dataSources || attrNode.resource || isMainResource) {
        context.errorContext = getErrorContext(isMainResource ? 'resource' : 'sub-resource', context);
        context.subAttrPath = [];
        context.dataSourceAttributes = {};

        if (isMainResource) {
            parseNode(attrNode, {
                'dataSources': null,
                'subFilters': parseSubFilters,
                'resource': checkIdentifier,
                'primaryKey': parsePrimaryKey,
                'attributes': null
            }, context);
        } else {
            parseNode(attrNode, {
                'dataSources': null,
                'subFilters': parseSubFilters,
                'resource': checkIdentifier,
                'primaryKey': parsePrimaryKey,
                'parentKey': parseRelationKey,
                'childKey': parseRelationKey,
                'many': parseBoolean,
                'joinVia': checkIdentifier,
                'attributes': null
            }, context);
        }

        handleResourceContext(attrNode, context);
    } else if (attrNode.attributes) {
        context.errorContext = getErrorContext('nested-attribute', context);

        parseNode(attrNode, {
            'attributes': null
        }, context);

        // no context-specific special-cases for nested-attributes
    } else {
        context.errorContext = getErrorContext('attribute', context);

        // prepare standard-mapping - except for fixed values:
        if (!attrNode.map && !('value' in attrNode)) {
            attrNode.map = null; // "null" means "set standard-mapping in parseMap()"
        }

        parseNode(attrNode, {
            'type': parseType,
            'multiValued': parseBoolean,
            'storedType': null, // FIXME: do something useful
            'delimiter': null,
            'map': parseMap,
            'filter': parseFilter,
            'order': parseOrder,
            'value': parseStaticValue,
            'depends': function (select) {
                return {MOCK: 'Select AST of \'' + select + '\''}; // TODO
            },
            'hidden': parseBoolean,
            'deprecated': parseBoolean
        }, context);

        handleAttributeContext(attrNode, context);
    }

    // recursion:
    if (attrNode.attributes) {
        for (subAttrName in attrNode.attributes) {
            subAttrNode = attrNode.attributes[subAttrName];

            subContext = _.clone(context);
            subContext.attrPath = context.attrPath.concat([subAttrName]);
            subContext.subAttrPath = context.subAttrPath.concat([subAttrName]);

            processNode(subAttrNode, subContext);
        }
    }

    if (attrNode.dataSources) {
        if (attrNode.primaryKey) {
            resolvePrimaryKey(attrNode, context);
        }

        prepareDataSources(attrNode, context);
    }
}

/**
 * @param optionsContext
 * @param context
 * @return {string}
 * @private
 */
function getErrorContext(optionsContext, context) {
    return ' in ' + optionsContext + ' "' + context.resourceName + ':' +
        (context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}') + '"';
}


/**
 * Handle special cases and checks for options in resource context.
 *
 * @private
 */
function handleResourceContext(attrNode, context) {
    var dataSourceName, dataSource;
    var errorContext = context.errorContext;

    if (attrNode.resource) {
        if ('subFilters' in attrNode) {
            throw new ImplementationError(
                'Adding subFilters for included sub-resource is not allowed' + context.errorContext);
        }
        if ('primaryKey' in attrNode) {
            throw new ImplementationError(
                'Overwriting primaryKey for included sub-resource is not allowed' + context.errorContext);
        }
    } else {
        if (!('primaryKey' in attrNode)) {
            throw new ImplementationError('Missing primaryKey' + context.errorContext);
        }
    }

    if (attrNode.dataSources) {
        for (dataSourceName in attrNode.dataSources) {
            context.dataSourceAttributes[dataSourceName] = [];

            dataSource = attrNode.dataSources[dataSourceName];

            if (!dataSource.type) {
                throw new ImplementationError(
                    'DataSource "' + dataSourceName + '" misses "type" option' + context.errorContext);
            }

            if (dataSource.joinParentKey) {
                context.errorContext = ' in joinParentKey' + errorContext;
                dataSource.joinParentKey = parsePrimaryKey(dataSource.joinParentKey, context);
                context.errorContext = errorContext;

                if (!dataSource.joinChildKey) {
                    throw new ImplementationError('DataSource "' + dataSourceName +
                        '" misses "joinChildKey" option' + context.errorContext);
                }
            }

            if (dataSource.joinChildKey) {
                context.errorContext = ' in joinChildKey' + errorContext;
                dataSource.joinChildKey = parsePrimaryKey(dataSource.joinChildKey, context);
                context.errorContext = errorContext;

                if (!dataSource.joinParentKey) {
                    throw new ImplementationError('DataSource "' + dataSourceName +
                        '" misses "joinParentKey" option' + context.errorContext);
                }
            }
        }
    }

    if (attrNode.joinVia) {
        if (!context.dataSourceAttributes[attrNode.joinVia]) {
            throw new ImplementationError(
                'Unknown DataSource "' + attrNode.joinVia + '" in joinVia' + context.errorContext);
        }
    }
}

/**
 * Handle special cases and checks for options in attribute context.
 *
 * @private
 */
function handleAttributeContext(attrNode, context) {
    var mappingName, mapping;
    var dataSourceName;

    if (!attrNode.type) {
        attrNode.type = 'string';
    }

    if (attrNode.map) {
        for (mappingName in attrNode.map) {
            mapping = attrNode.map[mappingName];
            for (dataSourceName in mapping) {
                if (!context.dataSourceAttributes[dataSourceName]) {
                    throw new ImplementationError(
                        'Unknown DataSource "' + dataSourceName + '" in map' + context.errorContext);
                }

                context.dataSourceAttributes[dataSourceName].push(mapping[dataSourceName]);
            }
        }

        if ('value' in attrNode) {
            throw new ImplementationError(
                'Static "value" in combination with "map" makes no sense' + context.errorContext);
        }
    }
}

/**
 * Resolve primaryKey per DataSource and fail if not all DataSources have the complete primaryKey.
 *
 * @private
 */
function resolvePrimaryKey(attrNode, context) {
    var dataSourceName;
    var errorContext;

    attrNode.resolvedPrimaryKey = {};
    for (dataSourceName in attrNode.dataSources) {
        if (attrNode.dataSources[dataSourceName].joinParentKey) continue;

        attrNode.resolvedPrimaryKey[dataSourceName] = [];
    }

    errorContext = context.errorContext;
    context.errorContext = ' in primaryKey' + errorContext;

    attrNode.primaryKey.forEach(function (primaryKeyAttrPath) {
        var primaryKeyAttrNode = getLocalAttribute(primaryKeyAttrPath, attrNode, context);

        // enable "equal" filter for visible non-composite primary keys by default:
        if (!primaryKeyAttrNode.filter && attrNode.primaryKey.length === 1) {
            if (!primaryKeyAttrNode.hidden) {
                primaryKeyAttrNode.filter = ['equal'];
            }
        }

        for (dataSourceName in attrNode.resolvedPrimaryKey) {
            if (!primaryKeyAttrNode.map.default[dataSourceName]) {
                throw new ImplementationError(
                    'Primary key attribute "' + primaryKeyAttrPath.join('.') + '" ' +
                    'is not mapped to "' + dataSourceName + '" DataSource' + context.errorContext);
            }
            attrNode.resolvedPrimaryKey[dataSourceName].push(primaryKeyAttrNode.map.default[dataSourceName]);
        }
    });

    context.errorContext = errorContext;
}

/**
 * Resolve attribute path inside current (sub-)resource relative to attrNode
 * and return child attrNode.
 *
 * @private
 */
function getLocalAttribute(path, attrNode, context) {
    path.forEach(function (attributeName) {
        if (!attrNode.attributes || !attrNode.attributes[attributeName]) {
            throw new ImplementationError(
                'Unknown attribute "' + path.join('.') + '"' + context.errorContext);
        }

        attrNode = attrNode.attributes[attributeName];

        if (attrNode.dataSources || attrNode.resource) {
            throw new ImplementationError(
                'Path "' + path.join('.') + '" references sub-resource' + context.errorContext);
        }
    });

    return attrNode;
}

/**
 * Call prepare() on all DataSources and pass them all collected possible attributes.
 *
 * @private
 */
function prepareDataSources(attrNode, context) {
    var dataSourceName, dataSource, dataSourceAttributes, dataSourceInstance;

    for (dataSourceName in attrNode.dataSources) {
        dataSource = attrNode.dataSources[dataSourceName];
        dataSourceAttributes = context.dataSourceAttributes[dataSourceName];
        dataSourceInstance = context.dataSources[dataSource.type];

        if (!dataSourceInstance) {
            throw new ImplementationError(
                'Invalid DataSource type "' + dataSource.type + '"' + context.errorContext);
        }

        if (dataSource.joinParentKey && dataSource.joinChildKey) {
            ['joinParentKey', 'joinChildKey'].forEach(function (joinKeyName) {
                var errorContext = context.errorContext;
                context.errorContext = ' in ' + joinKeyName + errorContext;

                dataSource[joinKeyName + 'Resolved'] = dataSource[joinKeyName].map(function (joinKeyAttrPath) {
                    var joinKeyAttrNode = getLocalAttribute(joinKeyAttrPath, attrNode, context);
                    if (!joinKeyAttrNode.map.default[dataSourceName]) {
                        throw new ImplementationError(
                            'Attribute "' + joinKeyAttrPath.join('.') + '" not mapped to DataSource "' +
                            dataSourceName + '"' + context.errorContext);
                    }

                    return joinKeyAttrNode.map.default[dataSourceName];
                });
                context.errorContext = errorContext;
            });
        }

        // make attributes unique:
        dataSourceAttributes = dataSourceAttributes.filter(function (value, index, self) {
            return self.indexOf(value) === index;
        });

        dataSourceInstance.prepare(dataSource, dataSourceAttributes);
    }
}


/**
 * Meta function which calls the defined parsers for current node and fails
 * on additionally defined options.
 *
 * @private
 */
function parseNode(attrNode, parsers, context) {
    var attrName, parser;
    var attrNames = Object.keys(attrNode);
    var errorContext = context.errorContext;

    for (attrName in parsers) {
        parser = parsers[attrName];

        context.errorContext = ' (option "' + attrName + '"' + errorContext + ')';
        removeValue(attrNames, attrName);

        if (attrName in attrNode && parser !== null) {
            attrNode[attrName] = parser(attrNode[attrName], context);
        }
    }

    context.errorContext = errorContext;

    if (attrNames.length > 0) {
        throw new ImplementationError('Invalid option "' + attrNames.join(', ') + '"' + context.errorContext);
    }
}

/**
 * @param array
 * @param value
 * @return {*}
 * @private
 */
function removeValue(array, value) {
    var index = array.indexOf(value);
    if (index !== -1) {
        return array.splice(index, 1)[0];
    }
    return null;
}


/**
 * Parses attribute/filter of subFilters.
 *
 * @private
 */
function parseSubFilters(subFilters, context) {
    subFilters.forEach(function (subFilter) {
        parseNode(subFilter, {
            'attribute': parseAttributePath,
            'filter': parseFilter
        }, context);
    });
    return subFilters;
}

/**
 * Parses "id", "meta.id,meta.context".
 *
 * @private
 */
function parsePrimaryKey(attrPathList, context) {
    return attrPathList.split(',').map(function (attrPath) {
        return parseAttributePath(attrPath, context);
    });
}

/**
 * Parses "{primary}", "id", "meta.id,meta.context".
 *
 * @private
 */
function parseRelationKey(relationKey, context) {
    if (relationKey === '{primary}') {
        return null;
    }
    return parsePrimaryKey(relationKey, context);
}

/**
 * @private
 */
function parseType(type, context) {
    return checkWhitelist(type, ['string', 'int', 'float', 'boolean', 'date', 'datetime', 'time', 'raw'], context);
}

/**
 * Parses "id", "id;fulltextSearch:articleId;articleBody:articleId".
 * Null generates default-mapping to primary DataSource from context.subAttrPath.
 * AST supports multiple mapping types - currently not implemented in syntax.
 *
 * @private
 */
function parseMap(map, context) {
    var parsed = {'default': {}};
    var primaryName = 'primary';

    if (map === null) {
        parsed['default'][primaryName] = context.subAttrPath.join('.');
    } else {
        map.split(';').forEach(function (part) {
            var dataSource;
            var parts = part.split(':', 2);

            if (parts.length < 2) dataSource = primaryName;
            else dataSource = parts.shift();

            parsed['default'][dataSource] = checkIdentifier(parts[0], context);
        });
    }
    return parsed;
}

/**
 * Parses "true", "equal,notEqual,greater,greaterOrEqual,less,lessOrEqual".
 *
 * "true" defaults to "equal".
 *
 * @private
 */
function parseFilter(filter, context) {
    if (filter === true || filter === 'true') {
        return ['equal'];
    }
    return parseList(filter, ['equal', 'notEqual', 'greater', 'greaterOrEqual', 'less', 'lessOrEqual'], context);
}

/**
 * Parses "true", "asc,desc,random,topflop".
 *
 * "true" defaults to "asc,desc".
 *
 * @private
 */
function parseOrder(order, context) {
    if (order === true || order === 'true') {
        return ['asc', 'desc'];
    }
    return parseList(order, ['asc', 'desc', 'random', 'topflop'], context);
}

/**
 * Parses "null" to null, other strings are passed through.
 *
 * @private
 */
function parseStaticValue(value/*, context*/) {
    return (value === 'null') ? null : value;
}

/**
 * Parses "true", true, "false", false.
 *
 * @private
 */
function parseBoolean(value, context) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new ImplementationError('Invalid boolean value "' + value + '"' + context.errorContext);
}

/**
 * Parses "id", "meta.id".
 *
 * @private
 */
function parseAttributePath(attrPath, context) {
    var parsed = attrPath.split('.');
    parsed.forEach(function (item) {
        checkIdentifier(item, context);
    });
    return parsed;
}

/**
 * Parses a list of comma-separated strings and validates them against whitelist.
 *
 * @private
 */
function parseList(list, whitelist, context) {
    var parsed = list.split(',');
    parsed.forEach(function (item) {
        checkWhitelist(item, whitelist, context);
    });
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
            'Invalid "' + str + '" (allowed: ' + whitelist.join(', ') + ')' + context.errorContext);
    }
    return str;
}

/**
 * Generates an error for invalid identifier strings. Identifiers contain letters,
 * numbers and underscore - and do not start with a number.
 *
 * @private
 */
function checkIdentifier(str, context) {
    if (! /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(str)) {
        throw new ImplementationError('Invalid identifier "' + str + '"' + context.errorContext);
    }
    return str;
}

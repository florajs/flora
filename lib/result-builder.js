/**
 * @module result-builder
 */
'use strict';

var _ = require('lodash');
var ImplementationError = require('flora-errors').ImplementationError;
var DataError = require('flora-errors').DataError;
var NotFoundError = require('flora-errors').NotFoundError;

var keySeparator = '-';

/**
 * Builds the result object from output of {@link module:datasource-executor|datasource-executor}.
 *
 * @param {Api}     api
 * @param {Object}  request
 * @param {Array}   rawResults      - Flat list of results from {@link module:datasource-executor|datasource-executor}
 * @param {Object}  resolvedConfig  - Request-specific config (selected attributes flagged)
 * @return {Object} Result object with "data" node and optional "cursor" node
 */
module.exports = function resultBuilder(api, request, rawResults, resolvedConfig) {
    var rawResult, result, context;

    preprocessRawResults(rawResults, resolvedConfig);

    context = {
        api: api,
        request: request,
        rawResults: rawResults,
        resourceAttrNode: resolvedConfig, // attribute node of current (sub-)resource
        attrPath: [], // current path from root
        primaryKey: null, // current primary key
        secondaryRows: null // current row of all DataSources (by primary key)
    };

    // determine primary result of main resource to iterate over at root level:
    rawResult = getPrimaryResult(resolvedConfig, context);

    if (!resolvedConfig.many) {
        if (rawResult.data.length <= 0) {
            throw new NotFoundError('Requested item not found');
        }
        // TODO: DataError when more than 1 result?

        result = {
            data: buildItem(resolvedConfig, rawResult.data[0], context)
        };
    } else {
        result = {
            cursor: {
                totalCount: rawResult.totalCount
            },
            data: rawResult.data.map(function (row) {
                return buildItem(resolvedConfig, row, context);
            })
        };
    }

    return result;
};

/**
 * Link resultIds into attribute tree and index rows by key.
 *
 * @private
 */
function preprocessRawResults(rawResults, resolvedConfig) {
    rawResults.forEach(function (rawResult, resultId) {
        // link resultIds into attribute tree (per DataSource):
        var attrNode = getAttribute(rawResult.attributePath, resolvedConfig);
        attrNode.dataSources[rawResult.dataSourceName].resultId = resultId;

        // index rows by childKey if available (top-level result has no childKey and does not need to be indexed):
        if (rawResult.childKey) {
            rawResult.indexedData = {};
            rawResult.data.forEach(function (row, i) {
                var key = rawResult.childKey.map(function (keyAttr) {
                    if (typeof row[keyAttr] === 'undefined') {
                        throw new DataError('Result-row ' + i + ' of ' +
                            '"' + (rawResult.attributePath.length > 0 ?
                                rawResult.attributePath.join('.') : '{root}') + '" ' +
                            '(DataSource "' + rawResult.dataSourceName + '") ' +
                            'misses child key attribute "' + keyAttr + '"');
                    }
                    return row[keyAttr];
                }).join(keySeparator);

                if (attrNode.many && rawResult.dataSourceName === attrNode.primaryDataSource) {
                    if (!rawResult.indexedData[key]) rawResult.indexedData[key] = [];
                    rawResult.indexedData[key].push(row);
                } else {
                    rawResult.indexedData[key] = row;
                }
            });
        }
    });
}

/**
 * Resolve attribute path relative to attrNode and return child attrNode
 *
 * @param {Array} path Array of attribute-names representing the path
 * @param {Object} attrNode Root node where to start resolving
 * @private
 */
function getAttribute(path, attrNode) {
    path.forEach(function (attrName) {
        if (!(attrNode.attributes && attrNode.attributes[attrName])) {
            throw new ImplementationError('Result-Builder: Unknown attribute "' + path.join('.') + '"');
        }
        attrNode = attrNode.attributes[attrName];
    });
    return attrNode;
}

/**
 * Recursively builds one item. This is where most of the magic happens.
 *
 * @private
 */
function buildItem(parentAttrNode, row, context) {
    var item = {}, attrName, attrNode;

    if (context.primaryKey === null) {
        // determine current primary key (from primary DataSource):
        var resAttrNode = context.resourceAttrNode;
        var indexKey = resAttrNode.resolvedPrimaryKey[resAttrNode.primaryDataSource];
        context.primaryKey = indexKey.map(function (keyAttr) {
            if (typeof row[keyAttr] === 'undefined') {
                throw new DataError('Result-row of ' +
                    '"' + (context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}') + '" ' +
                    '(DataSource "' + resAttrNode.primaryDataSource + '") ' +
                    'misses primary key attribute "' + keyAttr + '"');
            }
            return row[keyAttr];
        }).join(keySeparator);

        // link rows from secondary DataSources by primary key:
        context.secondaryRows = {};

        for (var dataSourceName in resAttrNode.dataSources) {
            if (dataSourceName === resAttrNode.primaryDataSource) continue;
            if (! ('resultId' in resAttrNode.dataSources[dataSourceName])) continue;

            var secondaryResult = context.rawResults[resAttrNode.dataSources[dataSourceName].resultId];
            if (typeof secondaryResult.indexedData[context.primaryKey] === 'undefined') {
                context.api.log.debug(new DataError('Secondary DataSource "' + dataSourceName + '" of ' +
                    '"' + (context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}') + '": ' +
                    'row with key "' + context.primaryKey + '" not found'));
                context.secondaryRows[dataSourceName] = null;
            } else {
                context.secondaryRows[dataSourceName] = secondaryResult.indexedData[context.primaryKey];
            }
        }
    }

    for (attrName in parentAttrNode.attributes) {
        attrNode = parentAttrNode.attributes[attrName];

        if (!attrNode.selected) continue;

        if (attrNode.attributes) {
            var subContext = _.clone(context);
            subContext.attrPath = context.attrPath.concat([attrName]);

            if (attrNode.dataSources) {
                // resource context:
                var rawResult = getPrimaryResult(attrNode, subContext);
                var keyIsNull = true;
                var key = rawResult.parentKey.map(function (keyAttr) {
                    if (typeof row[keyAttr] === 'undefined') {
                        throw new DataError('Sub-resource "' + subContext.attrPath.join('.') + '" ' +
                            'misses key attribute "' + keyAttr + '" in parent result ' +
                            '(DataSource "' + context.resourceAttrNode.primaryDataSource + '")');
                    } else if (row[keyAttr] !== null) {
                        keyIsNull = false;
                    }
                    return row[keyAttr];
                }).join(keySeparator);
                // TODO: Handle "multiValued = true" for parentKey
                // TODO: Handle "joinVia"

                var subRow = rawResult.indexedData[key];
                if (!subRow) {
                    if (attrNode.many) {
                        item[attrName] = [];
                    } else {
                        item[attrName] = null;

                        if (!keyIsNull) {
                            context.api.log.debug(new DataError('Foreign key ' + rawResult.parentKey.join(',') + ' = "' + key + '" ' +
                                'not found in sub-resource "' + subContext.attrPath.join('.') + '" ' +
                                '(DataSource "' + attrNode.primaryDataSource + '")'));
                        }
                    }
                } else {
                    subContext.resourceAttrNode = attrNode;
                    subContext.secondaryRows = null;
                    subContext.primaryKey = null;

                    if (attrNode.many) {
                        // if "many = true", subRow is always an array (see preprocessRawResults):
                        item[attrName] = subRow.map(function (singleSubRow) {
                            return buildItem(attrNode, singleSubRow, subContext);
                        });
                    } else {
                        item[attrName] = buildItem(attrNode, subRow, subContext);
                    }
                }
            } else {
                // nested-attribute context:
                item[attrName] = buildItem(attrNode, row, subContext);
            }
        } else {
            item[attrName] = buildAttribute(attrNode, row, context);
        }
    }

    // extension: "item"
    var resource = context.api.getResource(parentAttrNode.resourceName);
    if (resource && resource.extensions && resource.extensions.item) {
        context.api.log.trace('handle: "item" extension (%s)', parentAttrNode.resourceName);
        resource.extensions.item({
            request: context.request,
            item: item
        });
    }

    context.primaryKey = null; // clear primaryKey cache for next row

    return item;
}

function buildAttribute(attrNode, row, context) {
    var value = null;

    // value from mapped DataSource or static value:
    if (attrNode.map) {
        var mappedAttrName = attrNode.map.default[attrNode.selectedDataSource];

        if (attrNode.selectedDataSource === context.resourceAttrNode.primaryDataSource) {
            value = row[mappedAttrName];
        } else {
            if (!context.secondaryRows[attrNode.selectedDataSource]) {
                if (typeof context.secondaryRows[attrNode.selectedDataSource] === 'undefined') {
                    throw new ImplementationError('Secondary-Result for ' +
                        '"' + (context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}') + '" ' +
                        '(DataSource "' + attrNode.selectedDataSource + '") missing');
                }
                value = null;
            } else {
                value = context.secondaryRows[attrNode.selectedDataSource][mappedAttrName];
            }
        }

        if (typeof value === 'undefined') {
            throw new DataError('Result-row ID "' + context.primaryKey + '" ' +
                (context.attrPath.length > 0 ? 'of "' + context.attrPath.join('.') + '" ' : '') +
                '(DataSource "' + attrNode.selectedDataSource + '") ' +
                'misses attribute "' + mappedAttrName + '"');
        }
    } else if ('value' in attrNode) {
        value = attrNode.value;
    } else {
        // TODO: error?
    }

    return value;
}

/**
 * Get raw primary result for current (sub-)resource.
 *
 * @private
 */
function getPrimaryResult(attrNode, context) {
    var resultId = attrNode.dataSources[attrNode.primaryDataSource].resultId;
    if (typeof resultId === 'undefined') {
        throw new ImplementationError('Result for ' +
            '"' + (context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}') + '" ' +
            '(DataSource "' + attrNode.primaryDataSource + '") missing');
    }
    return context.rawResults[resultId];
}

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
    rawResult = getResult(resolvedConfig, resolvedConfig.primaryDataSource, context);

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

                if (!rawResult.uniqueChildKey) {
                    if (!rawResult.indexedData[key]) rawResult.indexedData[key] = [];
                    rawResult.indexedData[key].push(row);
                } else {
                    if (rawResult.indexedData[key]) {
                        throw new DataError('Result-row ' + i + ' of ' +
                            '"' + (rawResult.attributePath.length > 0 ?
                                rawResult.attributePath.join('.') : '{root}') + '" ' +
                            '(DataSource "' + rawResult.dataSourceName + '") ' +
                            'has duplicate child key "' + key + '"');
                    }
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
        context.secondaryRows = context.secondaryRows || {}; // row from joinVia-DataSource is passed via context here

        for (var dataSourceName in resAttrNode.dataSources) {
            if (dataSourceName === resAttrNode.primaryDataSource) continue;
            if (resAttrNode.joinVia && dataSourceName === resAttrNode.joinVia) continue;
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
                subContext.resourceAttrNode = attrNode;
                subContext.primaryKey = null;
                subContext.secondaryRows = null;

                var rawResult = getResult(attrNode, attrNode.joinVia || attrNode.primaryDataSource, subContext);
                var keyIsNull = true;
                var keys = rawResult.parentKey.map(function (keyAttr) {
                    if (typeof row[keyAttr] === 'undefined') {
                        /*
                        // TODO: Strict mode?
                        throw new DataError('Sub-resource "' + subContext.attrPath.join('.') + '" ' +
                            'misses key attribute "' + keyAttr + '" in parent result ' +
                            '(DataSource "' + context.resourceAttrNode.primaryDataSource + '")');
                        */
                    } else if (row[keyAttr] !== null) {
                        keyIsNull = false;
                    }
                    return row[keyAttr];
                });

                if (keyIsNull) {
                    keys = [];
                } else if (!rawResult.multiValuedParentKey) {
                    // normal and composite parentKey: "keys" is a string (as array) afterwards:
                    keys = [keys.join(keySeparator)];
                } else {
                    // dereference parentKey array (key length must be 1 when multiValued)
                    // but "keys" is still an array (multiValued) afterwards:
                    keys = keys[0];

                    if (!Array.isArray(keys)) {
                        throw new DataError('Sub-resource "' + subContext.attrPath.join('.') + '" ' +
                            'multiValued key attribute "' + rawResult.parentKey[0] + '" ' +
                            'in parent result is not an array ' +
                            '(DataSource "' + context.resourceAttrNode.primaryDataSource + '")');
                    }
                }

                var secondaryRows = null;
                if (attrNode.joinVia) {
                    var primaryRawResult = null; // set on demand to avoid errors for empty results
                    var joinViaKeys = [];
                    secondaryRows = {};

                    keys.forEach(function (key) {
                        var joinViaRows = rawResult.indexedData[key];
                        if (!joinViaRows) return;

                        if (rawResult.uniqueChildKey) joinViaRows = [joinViaRows];

                        joinViaRows.forEach(function (joinViaRow) {
                            primaryRawResult = primaryRawResult ||
                                getResult(attrNode, attrNode.primaryDataSource, subContext);

                            var childKeyIsNull = true;
                            var childKey = primaryRawResult.parentKey.map(function (keyAttr) {
                                if (typeof joinViaRow[keyAttr] === 'undefined') {
                                    throw new DataError('Sub-resource "' + subContext.attrPath.join('.') + '" ' +
                                        'misses key attribute "' + keyAttr + '" in joinVia result ' +
                                        '(DataSource "' + attrNode.joinVia + '")');
                                } else if (joinViaRow[keyAttr] !== null) {
                                    childKeyIsNull = false;
                                }
                                return joinViaRow[keyAttr];
                            }).join(keySeparator);

                            if (!childKeyIsNull) {
                                joinViaKeys.push(childKey);

                                secondaryRows[childKey] = {};
                                secondaryRows[childKey][attrNode.joinVia] = joinViaRow;
                            }
                        });
                    });

                    rawResult = primaryRawResult;
                    keys = joinViaKeys;
                }

                var subItem = [];
                keys.forEach(function (key) {
                    var subRow = rawResult.indexedData[key];
                    if (!subRow) {
                        context.api.log.debug(new DataError(
                            'Foreign key ' + rawResult.parentKey.join(',') + ' = "' + key + '" ' +
                            'not found in sub-resource "' + subContext.attrPath.join('.') + '" ' +
                            '(DataSource "' + attrNode.primaryDataSource + '")'));
                    } else {
                        subContext.secondaryRows = secondaryRows ? secondaryRows[key] : null;

                        if (!rawResult.uniqueChildKey) {
                            subRow.forEach(function (singleSubRow) {
                                subItem.push(buildItem(attrNode, singleSubRow, subContext));
                            });
                        } else {
                            subItem.push(buildItem(attrNode, subRow, subContext));
                        }
                    }
                });

                if (attrNode.many) {
                    item[attrName] = subItem;
                } else {
                    item[attrName] = subItem[0] || null;
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
            item: item,
            row: row,
            secondaryRows: context.secondaryRows,
            request: context.request
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
    }

    return value;
}

/**
 * Get raw result for given DataSource for current (sub-)resource.
 *
 * @private
 */
function getResult(attrNode, dataSourceName, context) {
    var resultId = attrNode.dataSources[dataSourceName].resultId;
    if (typeof resultId === 'undefined') {
        throw new ImplementationError('Result for ' +
            '"' + (context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}') + '" ' +
            '(DataSource "' + dataSourceName + '") missing');
    }
    return context.rawResults[resultId];
}

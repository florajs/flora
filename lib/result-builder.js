'use strict';

const { ImplementationError, DataError, NotFoundError } = require('flora-errors');

const keySeparator = '-';

/**
 * Resolve attribute path relative to attrNode and return child attrNode
 *
 * @param {Array} path Array of attribute-names representing the path
 * @param {Object} attrNode Root node where to start resolving
 * @private
 */
function getAttribute(path, attrNode) {
    path.forEach(attrName => {
        if (!(attrNode.attributes && attrNode.attributes[attrName])) {
            throw new ImplementationError(`Result-Builder: Unknown attribute "${path.join('.')}"`);
        }
        attrNode = attrNode.attributes[attrName];
    });
    return attrNode;
}

/**
 * Link resultIds into attribute tree and index rows by key.
 *
 * @private
 */
function preprocessRawResults(rawResults, resolvedConfig) {
    rawResults.forEach((rawResult, resultId) => {
        if (!rawResult.attributePath) return; // e.g. sub-filter results don't need indexing

        // link resultIds into attribute tree (per DataSource):
        const attrNode = getAttribute(rawResult.attributePath, resolvedConfig);
        attrNode.dataSources[rawResult.dataSourceName].resultId = resultId;

        // index rows by childKey if available
        // (top-level result has no childKey and does not need to be indexed):
        if (rawResult.childKey) {
            const keyAttr = rawResult.childKey.length === 1 ? rawResult.childKey[0] : null;
            rawResult.indexedData = {};
            rawResult.data.forEach((row, i) => {
                function dereferenceKeyAttr(keyAttrib) {
                    const keyVal = row[keyAttrib];
                    if (keyVal === undefined) {
                        const attrPath =
                            rawResult.attributePath.length > 0 ? rawResult.attributePath.join('.') : '{root}';
                        throw new DataError(
                            `Result-row ${i} of "${attrPath}" (DataSource "${
                                rawResult.dataSourceName
                            }") misses child key attribute "${keyAttr}"`
                        );
                    }
                    return keyVal;
                }

                const key = keyAttr
                    ? '' + dereferenceKeyAttr(keyAttr) // speed up non-composite keys
                    : rawResult.childKey.map(dereferenceKeyAttr).join(keySeparator);

                if (!rawResult.uniqueChildKey) {
                    if (!rawResult.indexedData[key]) rawResult.indexedData[key] = [];
                    rawResult.indexedData[key].push(row);
                } else {
                    if (rawResult.indexedData[key]) {
                        const attrPath =
                            rawResult.attributePath.length > 0 ? rawResult.attributePath.join('.') : '{root}';
                        throw new DataError(
                            `Result-row ${i} of "${attrPath}" (DataSource "${
                                rawResult.dataSourceName
                            }") has duplicate child key "${key}"`
                        );
                    }
                    rawResult.indexedData[key] = row;
                }
            });
        }
    });
}

/**
 * Determine current primary key (from primary DataSource).
 *
 * @private
 */
function resolvePrimaryKey(row, context) {
    const resAttrNode = context.resourceAttrNode;
    const indexKey = resAttrNode.resolvedPrimaryKey[resAttrNode.primaryDataSource];

    function dereferenceKeyAttr(keyAttr) {
        const keyVal = row[keyAttr];
        if (keyVal === undefined) {
            const attrPath = context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}';
            throw new DataError(
                `Result-row of "${attrPath}" (DataSource "${
                    resAttrNode.primaryDataSource
                }") misses primary key attribute "${keyAttr}"`
            );
        }
        return keyVal;
    }

    if (indexKey.length === 1) {
        context.primaryKey = '' + dereferenceKeyAttr(indexKey[0]);
    } else {
        context.primaryKey = indexKey.map(dereferenceKeyAttr).join(keySeparator);
    }

    // link rows from secondary DataSources by primary key:
    // row from joinVia-DataSource is passed via context here
    context.secondaryRows = context.secondaryRows || {};

    Object.keys(resAttrNode.dataSources).forEach(dataSourceName => {
        if (dataSourceName === resAttrNode.primaryDataSource) return;
        if (resAttrNode.joinVia && dataSourceName === resAttrNode.joinVia) return;
        if (!('resultId' in resAttrNode.dataSources[dataSourceName])) return;

        const secondaryResult = context.rawResults[resAttrNode.dataSources[dataSourceName].resultId];
        if (typeof secondaryResult.indexedData[context.primaryKey] === 'undefined') {
            context.api.log.debug(
                new DataError(
                    `Secondary DataSource "${dataSourceName}" of "` +
                        (context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}') +
                        `": row with key "${context.primaryKey}" not found`
                )
            );
            context.secondaryRows[dataSourceName] = null;
        } else {
            context.secondaryRows[dataSourceName] = secondaryResult.indexedData[context.primaryKey];
        }
    });
}

function buildAttribute(attrNode, row, context) {
    let value = null;

    // value from mapped DataSource or static value:
    if (attrNode.map) {
        const mappedAttrName = attrNode.map.default[attrNode.selectedDataSource];

        if (attrNode.selectedDataSource === context.resourceAttrNode.primaryDataSource) {
            value = row[mappedAttrName];
        } else if (!context.secondaryRows[attrNode.selectedDataSource]) {
            if (typeof context.secondaryRows[attrNode.selectedDataSource] === 'undefined') {
                const attrPath = context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}';
                throw new ImplementationError(
                    `Secondary-Result for "${attrPath}" (DataSource "${attrNode.selectedDataSource}") missing`
                );
            }
            value = null;
        } else {
            value = context.secondaryRows[attrNode.selectedDataSource][mappedAttrName];
        }

        if (typeof value === 'undefined') value = null;
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
    const resultId = attrNode.dataSources[dataSourceName].resultId;
    if (typeof resultId === 'undefined') {
        const attrPath = context.attrPath.length > 0 ? context.attrPath.join('.') : '{root}';
        throw new ImplementationError(`Result for "${attrPath}" (DataSource "${dataSourceName}") missing`);
    }
    return context.rawResults[resultId];
}

/**
 * Recursively builds one item. This is where most of the magic happens.
 *
 * @private
 */
function buildItem(parentAttrNode, row, context) {
    const item = {};

    if (context.primaryKey === null) resolvePrimaryKey(row, context);

    Object.keys(parentAttrNode.attributes).forEach(attrName => {
        const attrNode = parentAttrNode.attributes[attrName];

        if (context.useSelectedInternal) {
            if (!attrNode.selectedInternal) return;
        } else if (!attrNode.selected) return;

        if (attrNode.attributes) {
            const subContext = Object.assign({}, context);
            subContext.attrPath = context.attrPath.concat([attrName]);

            if (attrNode.dataSources) {
                // resource context:
                subContext.resourceAttrNode = attrNode;
                subContext.primaryKey = null;
                subContext.secondaryRows = null;

                let rawResult;
                let keys;
                let keyIsNull = true;
                let parentKeyRow = row;

                if (
                    attrNode.parentDataSource &&
                    attrNode.parentDataSource !== context.resourceAttrNode.primaryDataSource
                ) {
                    parentKeyRow = context.secondaryRows[attrNode.parentDataSource];
                }

                if (parentKeyRow) {
                    rawResult = getResult(attrNode, attrNode.joinVia || attrNode.primaryDataSource, subContext);
                    keys = rawResult.parentKey.map(keyAttr => {
                        if (typeof parentKeyRow[keyAttr] === 'undefined') {
                            /*
                            // TODO: Strict mode?
                            throw new DataError(`Sub-resource "${subContext.attrPath.join('.')}" ` +
                                misses keyattribute "${keyAttr}" in parent result ` +
                                `(DataSource "${context.resourceAttrNode.primaryDataSource}")`);
                            */
                        } else if (parentKeyRow[keyAttr] !== null) {
                            keyIsNull = false;
                        }
                        return parentKeyRow[keyAttr];
                    });
                }

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
                        throw new DataError(
                            `Sub-resource "${subContext.attrPath.join('.')}" ` +
                                `multiValued key attribute "${rawResult.parentKey[0]}" ` +
                                'in parent result is not an array ' +
                                `(DataSource "${context.resourceAttrNode.primaryDataSource}")`
                        );
                    }
                }

                let secondaryRows = null;
                if (attrNode.joinVia) {
                    let primaryRawResult = null; // set on demand to avoid errors for empty results
                    const joinViaKeys = [];
                    secondaryRows = {};

                    keys.forEach(key => {
                        let joinViaRows = rawResult.indexedData[key];
                        if (!joinViaRows) return;

                        if (rawResult.uniqueChildKey) joinViaRows = [joinViaRows];

                        joinViaRows.forEach(joinViaRow => {
                            primaryRawResult =
                                primaryRawResult || getResult(attrNode, attrNode.primaryDataSource, subContext);

                            let childKeyIsNull = true;
                            const childKey = primaryRawResult.parentKey
                                .map(keyAttr => {
                                    if (typeof joinViaRow[keyAttr] === 'undefined') {
                                        throw new DataError(
                                            `Sub-resource "${subContext.attrPath.join('.')}" ` +
                                                `misses key attribute "${keyAttr}" in joinVia result ` +
                                                `(DataSource "${attrNode.joinVia}")`
                                        );
                                    } else if (joinViaRow[keyAttr] !== null) {
                                        childKeyIsNull = false;
                                    }
                                    return joinViaRow[keyAttr];
                                })
                                .join(keySeparator);

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

                const subItem = [];
                keys.forEach(key => {
                    const subRow = rawResult.indexedData[key];
                    if (!subRow) {
                        // ignore
                    } else {
                        subContext.secondaryRows = secondaryRows ? secondaryRows[key] : null;

                        if (!rawResult.uniqueChildKey) {
                            subRow.forEach(singleSubRow => subItem.push(buildItem(attrNode, singleSubRow, subContext)));
                        } else {
                            subItem.push(buildItem(attrNode, subRow, subContext));
                        }
                    }
                });

                item[attrName] = attrNode.many ? subItem : subItem[0] || null;
            } else {
                // nested-attribute context:
                item[attrName] = buildItem(attrNode, row, subContext);
            }
        } else {
            item[attrName] = buildAttribute(attrNode, row, context);
        }
    });

    // Extension: "item"
    if (parentAttrNode.resourceName) {
        const resource = context.api.getResource(parentAttrNode.resourceName);
        if (resource && resource.extensions && resource.extensions.item) {
            resource.extensions.item({
                item,
                row,
                secondaryRows: context.secondaryRows,
                request: context.request,
                getAttribute: attribute => getAttribute(attribute || [], parentAttrNode),
                getResult: (attrNode, dataSourceName) =>
                    getResult(
                        attrNode || parentAttrNode,
                        dataSourceName || (attrNode || parentAttrNode).primaryDataSource,
                        context
                    ),
                buildItem: attributes => {
                    function selectInternal(isSelected) {
                        attributes.forEach(attribute => {
                            let attrNode = parentAttrNode;
                            attribute.forEach(attrName => {
                                if (!(attrNode.attributes && attrNode.attributes[attrName])) {
                                    throw new ImplementationError(
                                        `Result-Builder (item-extension/buildItem): Unknown attribute "${attribute.join(
                                            '.'
                                        )}"`
                                    );
                                }
                                attrNode = attrNode.attributes[attrName];

                                if (isSelected && attrNode.selectedInternal) {
                                    throw new ImplementationError(
                                        `Result-Builder (item-extension/buildItem): Invalid recursion for "${attribute.join(
                                            '.'
                                        )}"`
                                    );
                                }
                                attrNode.selectedInternal = isSelected;
                            });
                        });
                    }

                    const subContext = Object.assign({}, context);
                    subContext.useSelectedInternal = true;

                    selectInternal(true);
                    const internalItem = buildItem(parentAttrNode, row, subContext);
                    selectInternal(false);

                    return internalItem;
                }
            });
        }
    }

    context.primaryKey = null; // clear primaryKey cache for next row

    return item;
}

/**
 * Builds the result object from output of {@link module:datasource-executor|datasource-executor}.
 *
 * @param {Api}     api
 * @param {Object}  request
 * @param {Array}   rawResults      - Flat list of results from {@link datasource-executor}
 * @param {Object}  resolvedConfig  - Request-specific config (selected attributes flagged)
 * @return {Object} Result object with "data" node and optional "cursor" node
 */
module.exports = function resultBuilder(api, request, rawResults, resolvedConfig) {
    preprocessRawResults(rawResults, resolvedConfig);

    const context = {
        api,
        request,
        rawResults,
        resourceAttrNode: resolvedConfig, // attribute node of current (sub-)resource
        attrPath: [], // current path from root
        primaryKey: null, // current primary key
        secondaryRows: null, // current row of all DataSources (by primary key)
        useSelectedInternal: false // used for buildItem() in item-extension
    };

    // determine primary result of main resource to iterate over at root level:
    const rawResult = getResult(resolvedConfig, resolvedConfig.primaryDataSource, context);

    if (!resolvedConfig.many) {
        if (rawResult.data.length <= 0) {
            throw new NotFoundError(
                'Item' +
                    (request.id ? ` "${request.id}"` : '') +
                    (request.resource ? ` (in resource "${request.resource}")` : '') +
                    ' not found'
            );
        }
        // TODO: DataError when more than 1 result?

        return { data: buildItem(resolvedConfig, rawResult.data[0], context) };
    }

    return {
        cursor: { totalCount: rawResult.totalCount },
        data: rawResult.data.map(row => buildItem(resolvedConfig, row, context))
    };
};

'use strict';

const { Status } = require('@florajs/cluster');

const Cast = require('./cast');
const Profiler = require('./profiler');

/**
 * @param {Array} array Array of scalar values
 * @returns {Array}
 */
function uniq(array) {
    return [...new Set(array)];
}

/**
 * @param {Array} array Array of Arrays with scalar values
 * @returns {Array}
 */
function uniqArrays(array) {
    const map = new Map();
    const separator = '-';

    return array.filter((key) => {
        const jKey = Array.isArray(key) ? key.join(separator) : key;
        if (map.has(jKey)) return false;
        map.set(jKey, true);
        return true;
    });
}

/**
 * Handles data-source specific callback for an array of extensions
 */
async function callExtension(extensionName, dataSourceName, ev, extensions) {
    if (!extensions || !extensions[extensionName]) return;

    let extensionList = extensions[extensionName];

    for (let i = 0; i < extensionList.length; i++) {
        let extension = extensionList[i];

        // default to "primary" data source only:
        if (typeof extension === 'function') extension = { primary: extension };

        if (extension[dataSourceName]) {
            await extension[dataSourceName](ev);
        }
    }
}

/**
 * Execute all DataSources.
 *
 * Executes all subFilters, the main request and the subRequests, and may be
 * recursively called by the subRequests.
 *
 * @param {Api} api
 * @param {flora.Request} request
 * @param {Object} dst DataSourceTree
 * @return {Promise<Object>}
 * @private
 */
async function executeDst(api, request, dst) {
    let globalResults;

    const cast = new Cast(api);

    // Execute subFilters
    let subFilters = [];
    if (dst.subFilters) {
        subFilters = dst.subFilters.map((subFilter) => {
            subFilter._profiler = dst._profiler;
            return executeDst(api, request, subFilter);
        });
    }
    const allSubFilterResults = await Promise.all(subFilters);

    // Adjust the main request's filter to include the results from the subFilters
    /*
     * allSubFilterResults:
     * Results from all subFilters.
     * - Outer array: foreach subFilter
     * - Inner array: list of results per subFilter request.
     *   As there are no subRequests in subFilters, the length is 1
     */
    if (dst.request.filter) {
        // Build filter array for the main request
        const parentValues = {};
        /*
         * parentValues:
         * case 1: combined key:
         *   indexed by concatenated filter field:
         *   Example:
         *     {
         *       'instrumentId-exchangeId': [
         *         [133962, 12],
         *         [134000, 12]
         *       ]
         *     }
         * case 2: single key:
         *    Example:
         *     {
         *       'instrumentId': [133962, 134000]
         *     }
         */

        allSubFilterResults.forEach((subFilterResults, index) => {
            const subFilterResult = subFilterResults[0]; // only main result from each subFilter
            parentValues[index] = [];

            const pvs = [];
            for (let i = 0; i < subFilterResult.data.length; i++) {
                if (subFilterResult.parentKey.length === 1) {
                    if (Object.prototype.hasOwnProperty.call(subFilterResult.data[i], subFilterResult.childKey[0])) {
                        pvs.push(subFilterResult.data[i][subFilterResult.childKey[0]]);
                    }
                } else {
                    let partEmpty = false;
                    const part = subFilterResult.childKey.map((childKeyPart) => {
                        if (!Object.prototype.hasOwnProperty.call(subFilterResult.data[i], childKeyPart)) {
                            partEmpty = true;
                            return null;
                        }
                        return subFilterResult.data[i][childKeyPart];
                    });
                    if (!partEmpty) pvs.push(part);
                }
            }
            parentValues[index].push(pvs);
        });

        // Prevent duplicates for all parentValues properties

        Object.keys(parentValues).forEach((parentKeyIdx) => {
            parentValues[parentKeyIdx] = parentValues[parentKeyIdx].map((parentValue) => uniqArrays(parentValue));
        });

        // Replace "valueFromSubFilter" properties for the main resource
        // by the values from the parentValues object
        const requestFilter = [];
        dst.request.filter.forEach((orFilter) => {
            const orFilterNew = [];
            orFilter.forEach((andFilter) => {
                if (dst._isEmpty) return;

                if (!Object.prototype.hasOwnProperty.call(andFilter, 'valueFromSubFilter')) {
                    orFilterNew.push(andFilter);
                    return;
                }

                if (!parentValues[andFilter.valueFromSubFilter]) {
                    throw new Error(`Missing subFilter for attribute "${andFilter.attribute}"`);
                }

                parentValues[andFilter.valueFromSubFilter].forEach((pv) => {
                    if (dst._isEmpty) return;

                    const andfilterNew = Object.assign({}, andFilter);

                    if (pv.length === 0) {
                        andfilterNew.empty = true;
                    } else if (!Array.isArray(andFilter.attribute)) {
                        andfilterNew.value = pv;
                    } else {
                        andfilterNew.value = [];
                        for (let j = 0; j < andFilter.attribute.length; j++) {
                            andfilterNew.value[j] = pv[j];
                        }
                    }

                    orFilterNew.push(andfilterNew);
                });
            });
            if (orFilterNew.length > 0) requestFilter.push(orFilterNew);
        });

        // Remove AND filters with no results. If there are no OR filters left,
        // there are not results at all, so skip any datasource queries from here
        // TODO: move this to the loop above to avoid this additional run
        const newRequestFilter = requestFilter.filter((orFilter) => !orFilter.some((andFilter) => andFilter.empty));
        if (newRequestFilter.length === 0) dst._isEmpty = true;

        dst.request.filter = newRequestFilter;
    }

    // Cast filter values to their storedType
    if (!dst._isEmpty && dst.request.filter && dst.attributeOptions) {
        dst.request.filter.forEach((filter) => {
            if (!filter) return;

            filter.forEach((filterPart) => {
                if (Array.isArray(filterPart.attribute)) {
                    filterPart.attribute.forEach((attrPart, index) => {
                        const storedType = dst.attributeOptions[attrPart]
                            ? dst.attributeOptions[attrPart].storedType
                            : null;
                        if (!storedType) return;
                        if (Array.isArray(filterPart.value[index])) {
                            filterPart.value[index] = filterPart.value[index].map((valuePart) =>
                                cast.cast(valuePart, storedType)
                            );
                        } else {
                            filterPart.value[index] = cast.cast(filterPart.value[index], storedType);
                        }
                    });
                } else {
                    const storedType = dst.attributeOptions[filterPart.attribute]
                        ? dst.attributeOptions[filterPart.attribute].storedType
                        : null;
                    if (!storedType) return;
                    if (Array.isArray(filterPart.value)) {
                        filterPart.value = filterPart.value.map((valuePart) => cast.cast(valuePart, storedType));
                    } else {
                        filterPart.value = cast.cast(filterPart.value, storedType);
                    }
                }
            });
        });
    }

    let preExecuteEvent = {
        request: dst.request,
        dataSourceTree: dst,
        floraRequest: request
    };
    await callExtension('preExecute', dst.dataSourceName, preExecuteEvent, dst.extensions);

    // Execute the main request
    const mainResults = {
        data: [],
        totalCount: 0
    };
    ['attributePath', 'dataSourceName', 'childKey', 'parentKey', 'multiValuedParentKey', 'uniqueChildKey'].forEach(
        (key) => {
            if (Object.prototype.hasOwnProperty.call(dst, key)) mainResults[key] = dst[key];
        }
    );

    if (!dst._isEmpty) {
        const ds = api.dataSources[dst.request.type];
        if (!ds) throw new Error(`Unknown DataSource type "${dst.request.type}"`);

        // TODO: Move requestName generation into request-resolver:
        let requestName = 'unnamedRequest';
        if (dst.attributePath) {
            requestName =
                (dst.attributePath.length > 0 ? dst.attributePath.join('.') : '{root}') + ':' + dst.dataSourceName;
        }

        const status = request._status ? request._status.addChild('dataSourceRequests') : new Status();
        dst.request._status = status;
        status.set('requestName', requestName);
        status.set('type', dst.request.type);

        if (request._explain) dst.request._explain = {};

        const profiler = dst._profiler.child(requestName);
        dst.request._profiler = profiler;

        try {
            const rows = await ds.process(dst.request);
            profiler.end();
            status.close();

            if (dst.request._explain) {
                if (Array.isArray(rows.data)) {
                    dst.request._explain.countRows = rows.data.length;
                }
                if (!dst.request._explain.duration) {
                    dst.request._explain.duration = profiler.getDuration();
                }
            }

            mainResults.data = rows.data;
            mainResults.totalCount = rows.totalCount;
        } catch (err) {
            profiler.end();
            status.close();

            if (dst.request._explain) {
                dst.request._explain.error = '' + err;
                if (!dst.request._explain.duration) {
                    dst.request._explain.duration = profiler.getDuration();
                }
            }

            err.info = err.info || {};
            err.info.dataSource = requestName;
            throw err;
        }
    }

    // Transform the main results, do type casting
    /*
     * mainResults:
     * {
     *   "data": [
     *      {id: 1, firstname: "Alice"},
     *      {id: 3, firstname: "Bob"}, ...
     *   ]
     *   "totalCount": null // or the real count
     * }
     */
    if (dst.attributeOptions && typeof dst.attributeOptions === 'object') {
        mainResults.data.forEach((result) => {
            if (typeof result !== 'object') return;
            Object.keys(result).forEach((key) => {
                if (!dst.attributeOptions[key] || !dst.attributeOptions[key].type) return;
                result[key] = cast.cast(result[key], dst.attributeOptions[key]);
            });
        });
    }

    let postExecuteEvent = {
        request: dst.request,
        floraRequest: request,
        rawResults: mainResults
    };
    await callExtension('postExecute', dst.dataSourceName, postExecuteEvent, dst.extensions);

    // Add the main results to our global results array
    /*
     * globalResults
     * This is whats is being returned by executeDst:
     * [
     *    {data: ...}, // results of the main request
     *    {data: ...}, // results of the first subRequest
     *    {data: ...}, // results of the second subRequest
     *    ...
     * ]
     */
    globalResults = [mainResults];

    // Execute the subRequests
    if (dst.subRequests && mainResults && mainResults.data.length > 0) {
        // Prepare the subRequests that may be dependent from the main results.
        // "valueFromParentKey" properties are replaced by the appropriate values.
        const subRequests = dst.subRequests.map((subRequest) => {
            let parentValues = [];

            const flatten =
                subRequest.parentKey.length === 1 &&
                dst.attributeOptions &&
                dst.attributeOptions[subRequest.parentKey[0]] &&
                dst.attributeOptions[subRequest.parentKey[0]].multiValued;

            mainResults.data.forEach((mainResult) => {
                let isNull = true;
                let value;
                if (subRequest.parentKey.length === 1) {
                    value = mainResult[subRequest.parentKey[0]];
                    if (value !== null && typeof value !== 'undefined') isNull = false;
                } else {
                    value = subRequest.parentKey.map((m) => {
                        if (mainResult[m] !== null && typeof mainResult[m] !== 'undefined') isNull = false;
                        return mainResult[m];
                    });
                }
                if (isNull) return;

                if (flatten) {
                    if (Array.isArray(value)) Array.prototype.push.apply(parentValues, value);
                } else {
                    parentValues.push(value);
                }
            });

            if (parentValues.length === 0) subRequest._isEmpty = true;
            parentValues = subRequest.parentKey.length === 1 ? uniq(parentValues) : uniqArrays(parentValues);

            subRequest.request.filter.forEach((filters) => {
                filters.forEach((filter) => {
                    if (!filter.valueFromParentKey) return;
                    filter.value = parentValues;
                });
            });

            subRequest._profiler = dst._profiler;
            subRequest.request._parentResults = mainResults;
            return executeDst(api, request, subRequest);
        });

        const subResults = await Promise.all(subRequests);
        subResults.forEach((subResult) => {
            globalResults = globalResults.concat(subResult);
        });
    }

    // Add the subRequest results to the global results array
    delete dst._isEmpty; // clean up

    return globalResults;
}

/**
 * Actually execute a resolved request and call the DataSources.
 *
 * @param {Api} api
 * @param {flora.Request} request
 * @param {Object} dst DataSourceTree
 * @return {Promise<Object>}
 */
module.exports = function execute(api, request, dst) {
    dst._profiler = dst._profiler || new Profiler();
    return executeDst(api, request, dst);
};

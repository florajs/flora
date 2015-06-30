/**
 * @module datasource-executor
 */
'use strict';

var _ = require('lodash');
var Promise = require('when').Promise;
var cast = require('./cast');

/**
 * Actually execute a resolved request and call the DataSources.
 *
 * @param {Api}     api
 * @param {flora.Request} request
 * @param {Object}  dst         - DataSourceTree
 * @param {Function}callback
 */
module.exports = function execute(api, request, dst, callback) {
    executeDst(api, request, dst)
        .then(function (results) {
            callback(null, results);
        }, callback);
};

/**
 * Execute all subFilters.
 *
 * @param {Api}    api
 * @param {flora.Request} request
 * @param {Object} dst DataSourceTree
 * @return {Promise}
 * @private
 */
function processSubFilters(api, request, dst) {
    var subFilters = [];
    if (dst.subFilters) {
        subFilters = dst.subFilters.map(function (subFilter) {
            return executeDst(api, request, subFilter);
        });
    }
    return Promise.all(subFilters);
}

/**
 * Execute all DataSources.
 *
 * Executes all subFilters, the main request and the subRequests, and may be
 * recursively called by the subRequests.
 *
 * @param {Api}    api
 * @param {flora.Request} request
 * @param {Object} dst DataSourceTree
 * @return {Promise}
 * @private
 */
function executeDst(api, request, dst) {
    // extension: "preExecute" (resource)
    var resource = api.getResource(dst.resourceName);
    if (resource && resource.extensions && resource.extensions.preExecute) {
        api.log.trace('handle: "preExecute" extension (%s)', dst.resourceName);
        resource.extensions.preExecute({
            request: request,
            dataSourceTree: dst
        });
    }

    var globalResults;

    return processSubFilters(api, request, dst)

        // Adjust the main request's filter to include the results from the subFilters
        .then(function handleSubFilterResults(subFilterResults) {
            if (!dst.request.filter) return true;

            // Build filter array for the main request
            // parentValues is an object with parentKey => values, e.g.
            // {
            //     ['id']: [1, 2, 3, 5, 7, 11, 13],
            //     ...
            // }
            // FIXME: this format may be wrong in the docs above

            // TODO: check for attributeOptions.multiValued and split into multiple parentValues

            var parentValues = {};
            subFilterResults.forEach(function (subFilterResult) {
                subFilterResult = subFilterResult[0];
                var parentKey = subFilterResult.parentKey.join('-');
                parentValues[parentKey] = parentValues[parentKey] || [];
                parentValues[parentKey].push(subFilterResult.data.map(function (ff) {
                    return subFilterResult.childKey.map(function (childKeyPart) {
                        return ff[childKeyPart];
                    });
                }));
            });

            // TODO: use keyUniq to prevent duplicates for all parentValues properties

            // Replace "valueFromSubFilter" properties for the main resource
            // by the values from the parentValues object
            var requestFilter = [];
            dst.request.filter.forEach(function (filter) {
                var filterNew = [];
                filter.forEach(function (filterPart) {
                    if (dst._isEmpty) return;

                    // TODO: refactor for composite ff.attribute

                    if (dst.attributeOptions &&
                        dst.attributeOptions[filterPart.attribute] &&
                        dst.attributeOptions[filterPart.attribute].storedType) {
                        if (Array.isArray(filterPart.value)) {
                            filterPart.value = filterPart.value.map(function (value) {
                                return cast(value, {type: dst.attributeOptions[filterPart.attribute].storedType});
                            });
                        } else {
                            filterPart.value = cast(
                                filterPart.value,
                                {type: dst.attributeOptions[filterPart.attribute].storedType});
                        }
                    }

                    var attributeIdx = Array.isArray(filterPart.attribute)
                        ? filterPart.attribute.join('-')
                        : filterPart.attribute;
                    if (filterPart.valueFromSubFilter === true) {
                        if (!parentValues[attributeIdx]) {
                            throw new Error('Missing subFilter for attribute "' + filterPart.attribute + '"');
                        }
                        parentValues[attributeIdx].forEach(function (pv) {
                            if (dst._isEmpty) return;
                            var filterPartNew = _.clone(filterPart);

                            if (!Array.isArray(filterPart.attribute)) {
                                // We silently assume that childKey/parentKey have length 1
                                filterPartNew.value = pv.map(function (parentValue) {
                                    return parentValue[0];
                                });
                            } else {
                                filterPartNew.value = pv;
                            }
                            if (pv.length === 0) {
                                // One of the subFilters return an empty result,
                                // so the main results will also be empty, no need to execute
                                dst._isEmpty = true;
                            }
                            filterNew.push(filterPartNew);
                        });
                    } else {
                        filterNew.push(filterPart);
                    }
                });
                requestFilter.push(filterNew);
            });
            dst.request.filter = requestFilter;
        })

        // Execute the main request
        .then(function executeMainRequest() {
            return executeRequest(api, dst);
        })

        // Transform the main results, do type casting
        .then(function transformMainResults(mainResults) {
            if (!dst.attributeOptions) return mainResults;
            if (typeof dst.attributeOptions !== 'object') return mainResults;

            for (var idx in mainResults.data) {
                if (typeof mainResults.data[idx] !== 'object') continue;
                for (var key in mainResults.data[idx]) {
                    if (!dst.attributeOptions[key] || !dst.attributeOptions[key].type) continue;
                    mainResults.data[idx][key] = cast(mainResults.data[idx][key], dst.attributeOptions[key]);
                }
            }

            return mainResults;
        })

        // Add the main results to our global results array
        .then(function handleMainResults(mainResults) {
            globalResults = [mainResults];
            return mainResults;
        })

        // Execute the subRequests
        .then(function executeSubRequests(mainResults) {
            if (!dst.subRequests) return [];
            if (!mainResults || mainResults.data.length === 0) return [];

            // Prepare the subRequests that may be dependent from the main results.
            // "valueFromParentKey" properties are replaced by the appropriate values.
            var subRequests = dst.subRequests.map(function (subRequest) {
                var parentValues = keyUniq(mainResults.data
                    .map(function (mainResult) {
                        return subRequest.parentKey.map(function (m) {
                            return mainResult[m];
                        });
                    })
                    .filter(function (value) {
                        // skip null values. Not sure if this is really necessary.
                        if (!Array.isArray(value)) return true;
                        var isNull = true;
                        value.forEach(function (valueComponent) {
                            if (valueComponent !== null) isNull = false;
                        });
                        return !isNull;
                    })
                );

                subRequest.request.filter.forEach(function (filters) {
                    filters.forEach(function (filter) {
                        if (filter.valueFromParentKey === true) {
                            // TODO: convert to storedType of "filter.attribute"
                            if (!Array.isArray(filter.attribute)) {
                                filter.value = parentValues.map(function (value) {
                                    return value[0];
                                });
                            } else {
                                filter.value = parentValues;
                            }
                        }
                    });
                });

                return executeDst(api, request, subRequest);
            });

            return Promise.all(subRequests);
        })

        // Add the subRequest results to the global results array
        .then(function handleSubResults(subResults) {
            delete(dst._isEmpty); // clean up

            subResults.forEach(function (subResult) {
                globalResults = globalResults.concat(subResult);
            });
            return globalResults;
        })

        .then(function invokePostExecute(results) {
            // extension: "postExecute" (resource)
            if (resource && resource.extensions && resource.extensions.postExecute) {
                api.log.trace('handle: "postExecute" extension (%s)', dst.resourceName);
                resource.extensions.postExecute({
                    request: request,
                    rawResults: results
                });
            }

            return results;
        });
}

/**
 * Execute a single request.
 *
 * @param {Api} api
 * @param {Object} request
 * @return {Promise}
 * @private
 */
function executeRequest(api, request) {
    var result = {
        data: [],
        totalCount: 0
    };
    ['attributePath', 'dataSourceName', 'childKey', 'parentKey'].forEach(function (key) {
        if (request.hasOwnProperty(key)) result[key] = request[key];
    });

    return new Promise(function (resolve, reject) {
        // One of the subFilters may return an empty result,
        // so the main results will also be empty, no need to execute
        if (request._isEmpty) return resolve(result);

        var ds = api.dataSources[request.request.type];
        if (!ds) return reject(new Error('Unknown DataSource type "' + request.request.type + '"'));

        ds.process(request.request, function (err, rows) {
            if (err) return reject(err);

            result.data = rows.data;
            result.totalCount = rows.totalCount;
            resolve(result);
        });
    });
}

/**
 * Creates an array of unique values, values are compared by their
 * `toString` representation.
 *
 * @param {Array} array
 * @returns {Array}
 */
function keyUniq(array) {
    return _.uniq(array, false, function iteratee(value) {
        return value.toString();
    });
}

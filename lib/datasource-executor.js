/**
 * @module datasource-executor
 */
'use strict';

var _ = require('lodash');
var Promise = require('when').Promise;

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

    var finalResults;

    return processSubFilters(api, request, dst)

        .then(function handleSubFilterResults(subFilterResults) {
            if (!dst.request.filter) return true;

            // Build filter array for the main request
            // parentValues is an object with parentKey => values, e.g.
            // {
            //     ['id']: [1, 2, 3, 5, 7, 11, 13],
            //     ...
            // }
            var parentValues = {};
            subFilterResults.forEach(function (subFilterResult) {
                subFilterResult = subFilterResult[0];

                // TODO: refactor for composite parentKey

                parentValues[subFilterResult.parentKey] = parentValues[subFilterResult.parentKey] || [];
                parentValues[subFilterResult.parentKey].push(subFilterResult.data.map(function (ff) {
                    return ff[subFilterResult.childKey];
                }));
            });

            // TODO: use keyUniq to prevent duplicates for all parentValues properties

            // Replace "valueFromSubFilter" properties for the main resource
            // by the values from the parentValues object
            var newFilter = [];
            dst.request.filter.forEach(function (f) {
                var f2 = [];
                f.forEach(function (ff) {
                    if (dst._isEmpty) return;
                    if (ff.valueFromSubFilter === true) {
                        if (!parentValues[ff.attribute]) {
                            throw new Error('Missing subFilter for attribute "' + ff.attribute + '"');
                        }
                        parentValues[ff.attribute].forEach(function (pv) {
                            if (dst._isEmpty) return;
                            var ff2 = _.clone(ff);
                            ff2.value = pv;
                            if (pv.length === 0) {
                                // One of the subFilters return an empty result,
                                // so the main results will also be empty, no need to execute
                                dst._isEmpty = true;
                            }
                            f2.push(ff2);
                        });
                    } else {
                        f2.push(ff);
                    }
                });
                newFilter.push(f2);
            });
            dst.request.filter = newFilter;
        })

        .then(function prepareMainRequest() {
            return executeRequest(api, dst);
        })

        .then(function handleMainResults(mainResults) {
            finalResults = [mainResults];
            return finalResults;
        })

        .then(function prepareSubRequests(mainResults) {
            if (!dst.subRequests) return [];

            // Main request returned no results, so no need to execute sub requests
            if (mainResults.length === 0) return [];
            if (mainResults[0].data.length === 0) return [];

            // Prepare the subRequests that may be dependent from the main results.
            // "valueFromParentKey" properties are replaced by the appropriate values.
            var subRequests = dst.subRequests.map(function (subRequest) {
                var parentValues = keyUniq(mainResults[0].data
                    .map(function (mainResult) {
                        var res = subRequest.parentKey.map(function (m) {
                            return mainResult[m];
                        });
                        return res;
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
                            if (!Array.isArray(filter.attribute)) {
                                filter.value = parentValues.map(function (v) {
                                    return v[0];
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

        .then(function handleSubResults(subResults) {
            delete(dst._isEmpty); // clean up

            if (subResults.length === 0) {
                return finalResults;
            } else {
                subResults.forEach(function (subResult) {
                    finalResults = finalResults.concat(subResult);
                });
                return finalResults;
            }
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
        if (request._isEmpty) {
            // One of the subFilters return an empty result,
            // so the main results will also be empty, no need to execute
            resolve(result);
            return;
        }

        var ds = api.dataSources[request.request.type];
        if (!ds) {
            reject(new Error('Unknown DataSource type "' + request.request.type + '"'));
            return;
        }

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

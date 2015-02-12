/**
 * @module datasource-executor
 */
'use strict';

var _ = require('lodash');
var Promise = require('when').Promise;

/**
 * Actually execute a resolved request and call the DataSources.
 *
 * @param {Object}  dst         - DataSourceTree
 * @param {Object}  dataSources
 * @param {Function}callback
 */
module.exports = function execute(dst, dataSources, callback) {
    executeDst(dst, dataSources)
        .then(function (results) {
            callback(null, results);
        }, callback);
};

/**
 * Execute all subFilters.
 *
 * @param {Object} dst DataSourceTree
 * @param {Object} dataSources
 * @return {Promise}
 * @private
 */
function processSubFilters(dst, dataSources) {
    var subFilters = [];
    if (dst.subFilters) {
        subFilters = dst.subFilters.map(function (subFilter) {
            return executeDst(subFilter, dataSources);
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
 * @param {Object} dst DataSourceTree
 * @param {Object} dataSources
 * @return {Promise}
 * @private
 */
function executeDst(dst, dataSources) {
    var finalResults;

    return processSubFilters(dst, dataSources)

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
                parentValues[subFilterResult.parentKey] = parentValues[subFilterResult.parentKey] || [];
                parentValues[subFilterResult.parentKey].push(subFilterResult.data.map(function (ff) {
                    return ff[subFilterResult.childKey];
                }));
            });

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
            return executeRequest(dst, dataSources);
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
                var parentValues = mainResults[0].data
                    .map(function (mainResult) {
                        return mainResult[subRequest.parentKey];
                    })
                    .filter(function (value) {
                        return (value !== null);
                    });
                subRequest.request.filter.forEach(function (f) {
                    f.forEach(function (ff) {
                        if (ff.valueFromParentKey === true) ff.value = parentValues;
                    });
                });
                return executeDst(subRequest, dataSources);
            });

            return Promise.all(subRequests);
        })

        .then(function handleSubResults(subResults) {
            delete(dst._isEmpty); // clean up

            if (subResults.length === 0) {
                return finalResults;
            } else {
                return finalResults.concat(subResults[0]);
            }
        });
}

/**
 * Execute a single request.
 *
 * @param {Object} request
 * @param {Object} dataSources
 * @return {Promise}
 * @private
 */
function executeRequest(request, dataSources) {
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

        var ds = dataSources[request.request.type];
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

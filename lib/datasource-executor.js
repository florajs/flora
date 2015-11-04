/**
 * @module datasource-executor
 */
'use strict';

var _ = require('lodash');
var Promise = require('when').Promise;
var cast = require('./cast');
var Status = require('flora-cluster').Status;
var Profiler = require('./profiler');

/**
 * Actually execute a resolved request and call the DataSources.
 *
 * @param {Api}     api
 * @param {flora.Request} request
 * @param {Object}  dst         - DataSourceTree
 * @param {Function}callback
 */
module.exports = function execute(api, request, dst, callback) {
    dst._profiler = dst._profiler || new Profiler();
    executeDst(api, request, dst)
        .then(function (results) {
            callback(null, results);
        }, callback);
};

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
    var globalResults;


    return (new Promise(function (resolve) {
        resolve();
    }))

        // Execute subFilters
        .then(function executeSubFilters() {
            var subFilters = [];
            if (dst.subFilters) {
                subFilters = dst.subFilters.map(function (subFilter) {
                    subFilter._profiler = dst._profiler;
                    return executeDst(api, request, subFilter);
                });
            }

            return Promise.all(subFilters);
        })

        // Adjust the main request's filter to include the results from the subFilters
        .then(function handleSubFilterResults(subFilterResults) {
            if (!dst.request.filter) return true;

            // Build filter array for the main request
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

            // Prevent duplicates for all parentValues properties
            for (var parentKeyIdx in parentValues) {
                for (var i = 0; i < parentValues[parentKeyIdx].length; i++) {
                    parentValues[parentKeyIdx][i] = _.uniq(parentValues[parentKeyIdx][i], false, String);
                }
            }

            // Replace "valueFromSubFilter" properties for the main resource
            // by the values from the parentValues object
            var requestFilter = [];
            dst.request.filter.forEach(function (filter) {
                var filterNew = [];
                filter.forEach(function (filterPart) {
                    if (dst._isEmpty) return;

                    if (!filterPart.valueFromSubFilter) {
                        filterNew.push(filterPart);
                        return;
                    }

                    var attributeIdx = Array.isArray(filterPart.attribute)
                        ? filterPart.attribute.join('-')
                        : filterPart.attribute;

                    if (!parentValues[attributeIdx]) {
                        throw new Error('Missing subFilter for attribute "' + filterPart.attribute + '"');
                    }

                    parentValues[attributeIdx].forEach(function (pv) {
                        if (dst._isEmpty) return;
                        if (pv.length === 0) {
                            // One of the subFilters return an empty result,
                            // so the main results will also be empty, no need to execute
                            dst._isEmpty = true;
                            filterNew.push(filterPart);
                            return;
                        }

                        var filterPartNew = _.clone(filterPart);

                        if (!Array.isArray(filterPart.attribute)) {
                            // We silently assume that childKey/parentKey have length 1
                            filterPartNew.value = pv.map(function (parentValue) {
                                return parentValue[0];
                            });
                        } else {
                            filterPartNew.value = [];
                            for (var j = 0; j < filterPart.attribute.length; j++) {
                                filterPartNew.value[j] = pv[j];
                            }
                        }

                        filterNew.push(filterPartNew);
                    });
                });
                requestFilter.push(filterNew);
            });

            dst.request.filter = requestFilter;
        })

        // Cast filter values to their storedType
        .then(function castFilterValues() {
            if (dst._isEmpty) return;
            if (!dst.request.filter) return;
            if (!dst.attributeOptions) return;

            dst.request.filter.forEach(function (filter) {
                if (!filter) return;

                filter.forEach(function (filterPart) {
                    var storedType;

                    if (Array.isArray(filterPart.attribute)) {
                        for (var j = 0; j < filterPart.attribute.length; j++) {
                            storedType = (dst.attributeOptions[filterPart.attribute[j]]) ?
                                dst.attributeOptions[filterPart.attribute[j]].storedType : null;
                            if (!storedType) continue;
                            if (Array.isArray(filterPart.value[j])) {
                                filterPart.value[j] = filterPart.value[j].map(function (valuePart) {
                                    return cast(valuePart, storedType);
                                });
                            } else {
                                filterPart.value[j] = cast(filterPart.value[j], storedType);
                            }
                        }
                    } else {
                        storedType = (dst.attributeOptions[filterPart.attribute]) ?
                            dst.attributeOptions[filterPart.attribute].storedType : null;
                        if (!storedType) return;
                        if (Array.isArray(filterPart.value)) {
                            filterPart.value = filterPart.value.map(function (valuePart) {
                                return cast(valuePart, storedType);
                            });
                        } else {
                            filterPart.value = cast(filterPart.value, storedType);
                        }
                    }
                });
            });
        })

        // extension: "preExecute" (resource)
        .then(function invokePreExecute() {
            var resource = api.getResource(dst.resourceName);
            if (resource && resource.extensions && resource.extensions.preExecute) {
                api.log.trace('handle: "preExecute" extension (%s)', dst.resourceName);
                resource.extensions.preExecute({
                    name: dst.dataSourceName,
                    request: dst.request,
                    dataSourceTree: dst,
                    floraRequest: request
                });
            }
        })

        // Execute the main request
        .then(function executeMainRequest() {
            var result = {
                data: [],
                totalCount: 0
            };
            [
                'attributePath', 'dataSourceName', 'childKey', 'parentKey',
                'multiValuedParentKey', 'uniqueChildKey'
            ].forEach(function (key) {
                if (dst.hasOwnProperty(key)) result[key] = dst[key];
            });

            return new Promise(function (resolve, reject) {
                if (dst._isEmpty) return resolve(result);

                var ds = api.dataSources[dst.request.type];
                if (!ds) return reject(new Error('Unknown DataSource type "' + dst.request.type + '"'));

                // TODO: Move requestName generation into request-resolver:
                var requestName = 'unnamedRequest';
                if (dst.attributePath) {
                    requestName = (dst.attributePath.length > 0 ? dst.attributePath.join('.') : '{root}') +
                        ':' + dst.dataSourceName;
                }

                dst.request._status = request._status ? request._status.addChild('dataSourceRequests') : new Status();
                dst.request._status.set('requestName', requestName);
                dst.request._status.set('type', dst.request.type);

                if (request._explain) dst.request._explain = {};

                dst.request._profiler = dst._profiler.child(requestName);

                ds.process(dst.request, function (err, rows) {
                    dst.request._profiler.end();
                    dst.request._status.close();
                    if (dst.request._explain) {
                        if (!err && Array.isArray(rows.data)) {
                            dst.request._explain.countRows = rows.data.length;
                        }
                        if (err) dst.request._explain.error = '' + err;
                        if (!dst.request._explain.duration) {
                            dst.request._explain.duration = dst.request._profiler.getDuration();
                        }
                    }
                    if (err) {
                        err.info = err.info || {};
                        err.info.dataSource = requestName;
                        return reject(err);
                    }

                    result.data = rows.data;
                    result.totalCount = rows.totalCount;
                    resolve(result);
                });
            });
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

        // extension: "postExecute" (resource)
        .then(function invokePostExecute(mainResults) {
            var resource = api.getResource(dst.resourceName);
            if (resource && resource.extensions && resource.extensions.postExecute) {
                api.log.trace('handle: "postExecute" extension (%s)', dst.resourceName);
                resource.extensions.postExecute({
                    name: dst.dataSourceName,
                    request: dst.request,
                    floraRequest: request,
                    rawResults: mainResults
                });
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
                var parentValues = [];

                mainResults.data.forEach(function (mainResult) {
                    var isNull = true;
                    var value = subRequest.parentKey.map(function (m) {
                        if (mainResult[m] !== null && typeof mainResult[m] !== 'undefined') isNull = false;
                        return mainResult[m];
                    });
                    if (!isNull) parentValues.push(value);
                });

                // Flatten multiValued keys (not supported for combined keys!)
                if (subRequest.parentKey.length === 1 &&
                    dst.attributeOptions &&
                    dst.attributeOptions[subRequest.parentKey[0]] &&
                    dst.attributeOptions[subRequest.parentKey[0]].multiValued) {
                    var newParentValues = [];
                    parentValues.forEach(function (parentValue) {
                        if (!Array.isArray(parentValue[0])) return;
                        newParentValues = newParentValues.concat(parentValue[0].map(function (value) {
                            return [value];
                        }));
                    });
                    parentValues = newParentValues;
                }

                parentValues = _.uniq(parentValues, false, String);
                if (!parentValues.length) subRequest._isEmpty = true;

                subRequest.request.filter.forEach(function (filters) {
                    filters.forEach(function (filter) {
                        if (!filter.valueFromParentKey) return;
                        if (!Array.isArray(filter.attribute)) {
                            filter.value = parentValues.map(function (value) {
                                return value[0];
                            });
                        } else {
                            filter.value = parentValues;
                        }
                    });
                });

                subRequest._profiler = dst._profiler;
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
        });
}

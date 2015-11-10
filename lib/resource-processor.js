'use strict';

var async = require('async');
var configLoader = require('./config-loader');
var parseXml = require('./xml-reader');
var configParser = require('./config-parser');
var requestParser = require('./request-parser');
var requestResolver = require('./request-resolver');
var dataSourceExecutor = require('./datasource-executor');
var resultBuilder = require('./result-builder');
var ImplementationError = require('flora-errors').ImplementationError;

/**
 * Provides a clean interface for DataSource configurations and their
 * relations.
 *
 * @constructor
 * @param {Api} api
 */
var ResourceProcessor = function ResourceProcessor(api) {
    this.log = api.log.child({'component': 'resource-processor'});
    /** @type {Api} */
    this.api = api;
    this.resourceConfigs = {};
};

/**
 * Initialize and handle the config.
 *
 * @param {Object} config
 * @param {Function} callback
 */
ResourceProcessor.prototype.init = function init(config, callback) {
    var self = this;

    config = config || {};

    if (!config.resourcesPath) {
        this.log.warn('No resourcesPath in configuration, not loading any resources');
        return callback();
    }

    this.log.debug('Loading configuration');
    configLoader({
        directory: config.resourcesPath,
        parsers: { xml: parseXml }
    }, function (err, configs) {
        if (err) return callback(err);

        self.resourceConfigs = configs;
        self.log.debug('Parsing configs');
        try {
            configParser(self.resourceConfigs, self.api.dataSources);
        } catch (e) {
            return callback(e);
        }
        callback();
    });
};

/**
 * Handle request.
 *
 * @param {Request} request
 * @param {Response} response
 */
ResourceProcessor.prototype.handle = function handle(request, response) {
    var self = this;
    var resolvedDataSourceTree = null;

    async.waterfall([

        // extension: "request" (resource)
        function (callback) {
            self.log.trace('handle: "request" extensions (resource)');
            var resource = self.api.getResource(request.resource);

            if (resource && resource.extensions && resource.extensions.request) {
                self.api.log.trace('handle: "request" extension (%s)', request.resource);
                resource.extensions.request({request: request});
            }

            callback(null, request);
        },

        // requestParser
        function (req, callback) {
            self.log.trace('handle: requestParser');
            var profiler, requestAST;

            try {
                profiler = request._profiler.child('requestParser');
                requestAST = requestParser(req);
                profiler.end();
            } catch (e) {
                profiler.end();
                return callback(e);
            }

            callback(null, requestAST);
        },

        // requestResolver
        function (requestAST, callback) {
            self.log.trace('handle: requestResolver');
            var profiler, resolved;

            try {
                profiler = request._profiler.child('requestResolver');
                resolved = requestResolver(requestAST, self.resourceConfigs);
                profiler.end();
                resolvedDataSourceTree = resolved.dataSourceTree;
            } catch (e) {
                profiler.end();
                return callback(e);
            }

            callback(null, resolved);
        },

        // dataSourceExecutor
        function (resolved, callback) {
            self.log.trace('handle: dataSourceExecutor');
            resolved.dataSourceTree._profiler = request._profiler.child('dataSourceExecutor');
            dataSourceExecutor(self.api, request, resolved.dataSourceTree, function (err, rawResults) {
                resolved.dataSourceTree._profiler.end();
                callback(err, resolved, rawResults);
            });
        },

        // resultBuilder
        function (resolved, rawResults, callback) {
            self.log.trace('handle: resultBuilder');
            var profiler, results;

            try {
                profiler = request._profiler.child('resultBuilder');
                results = resultBuilder(self.api, request, rawResults, resolved.resolvedConfig);
                profiler.end();
            } catch (e) {
                profiler.end();
                return callback(e);
            }

            response.cursor = results.cursor;

            callback(null, results.data);
        }

    ], function (err, data) {
        // explain even in case of an error:
        if ((request._explain === '1' || request._explain === 'full') && self.api.config.allowExplain) {
            if (!resolvedDataSourceTree) {
                response.meta.explain = {error: 'Unresolveable request'};
            } else {
                response.meta.explain = explainDataSourceTree(resolvedDataSourceTree, request._explain === 'full');
            }
        }

        if (err) {
            if (!(err instanceof Error)) {
                err = new ImplementationError('Invalid error thrown: ' + err);
            }
            self.log.debug(err, 'handle: error');
            return response.send(err);
        }

        response.send(data);
    });
};

module.exports = ResourceProcessor;

function explainDataSourceTree(dst, full) {
    var explain = {};

    if (dst.subFilters) {
        explain.subFilters = dst.subFilters.map(function (subFilter) {
            return explainDataSourceTree(subFilter, full);
        });
    }

    // TODO: Move requestName generation into request-resolver:
    var requestName = dst.attributePath ?
        dst.attributePath.join('.') + ':' + dst.dataSourceName : 'unnamedRequest';

    explain.requestName = requestName;
    explain.type = dst.request.type;

    if (full) {
        explain.attributes = dst.request.attributes ? dst.request.attributes.join(',') : undefined;
        explain.filter = dst.request.filter ? dst.request.filter.map(function (orFilter) {
            return orFilter.map(function (andFilter) {
                var operators = {
                    'equal': '=',
                    'notEqual': '!=',
                    'less': '<',
                    'lessOrEqual': '<=',
                    'greater': '>',
                    'greaterOrEqual': '>=',
                };

                function renderRecursiveArray(array) {
                    if (!Array.isArray(array)) return array;
                    return '[' + array.map(renderRecursiveArray).join(',') + ']';
                }

                return renderRecursiveArray(andFilter.attribute) +
                    (operators[andFilter.operator] ? operators[andFilter.operator] :
                        ' ' + andFilter.operator + ' ') +
                    renderRecursiveArray(andFilter.value) +
                    (andFilter.valueFromParentKey ? '{from-parent-key}' : '') +
                    (andFilter.valueFromSubFilter ? '{from-sub-filter}' : '');
            }).join(' AND ');
        }).join(' OR ') : undefined;
        explain.search = dst.request.search;
        explain.order = dst.request.order ? dst.request.order.map(function (order) {
            return order.attribute + ':' + order.direction;
        }).join(',') : undefined;
        explain.limit = dst.request.limit;
        explain.page = dst.request.page;
    }

    if (dst.request._explain) {
        for (var name in dst.request._explain) {
            explain[name] = dst.request._explain[name];
        }
    } else {
        explain.executed = false;
    }

    if (dst.subRequests) {
        explain.subRequests = dst.subRequests.map(function (subRequest) {
            return explainDataSourceTree(subRequest, full);
        });
    }

    return explain;
}

'use strict';

const async = require('async');
const { ImplementationError } = require('flora-errors');
const requestParser = require('flora-request-parser');
const has = require('has');

const configLoader = require('./config-loader');
const parseXml = require('./xml-reader');
const configParser = require('./config-parser');
const requestResolver = require('./request-resolver');
const dataSourceExecutor = require('./datasource-executor');
const resultBuilder = require('./result-builder');

function explainDataSourceTree(dst, full) {
    const explain = {};

    if (dst.subFilters) {
        explain.subFilters = dst.subFilters.map(subFilter =>
            explainDataSourceTree(subFilter, full));
    }

    // TODO: Move requestName generation into request-resolver:
    const requestName = dst.attributePath ?
        dst.attributePath.join('.') + ':' + dst.dataSourceName : 'unnamedRequest';

    explain.requestName = requestName;
    explain.type = dst.request.type;

    if (full) {
        explain.attributes = dst.request.attributes ? dst.request.attributes.join(',') : undefined;
        explain.filter = dst.request.filter ? dst.request.filter.map(orFilter =>
            orFilter.map((andFilter) => {
                const operators = {
                    equal: '=',
                    notEqual: '!=',
                    less: '<',
                    lessOrEqual: '<=',
                    greater: '>',
                    greaterOrEqual: '>=',
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
                    (has(andFilter, 'valueFromSubFilter') ? `{from-sub-filter: ${andFilter.valueFromSubFilter}}` : '');
            }).join(' AND ')
        ).join(' OR ') : undefined;
        explain.search = dst.request.search;
        explain.order = dst.request.order
            ? dst.request.order.map(order => (order.attribute + ':' + order.direction)).join(',')
            : undefined;
        explain.limit = dst.request.limit;
        explain.page = dst.request.page;
    }

    if (dst.request._explain) {
        Object.assign(explain, dst.request._explain);
    } else {
        explain.executed = false;
    }

    if (dst.subRequests) {
        explain.subRequests = dst.subRequests.map(subRequest =>
            explainDataSourceTree(subRequest, full));
    }

    return explain;
}

/**
 * Provides a clean interface for DataSource configurations and their
 * relations.
 */
class ResourceProcessor {
    /**
     * @param {Api} api
     */
    constructor(api) {
        this.log = api.log.child({ component: 'resource-processor' });
        this.api = api;
        this.resourceConfigs = {};
    }

    /**
     * Initialize and handle the config.
     *
     * @param {Object} config
     * @param {Function} callback
     */
    init(config, callback) {
        config = config || {};

        if (!config.resourcesPath) {
            this.log.warn('No resourcesPath in configuration, not loading any resources');
            return callback();
        }

        this.log.debug('Loading configuration');
        return configLoader(this.api, {
            directory: config.resourcesPath,
            parsers: { xml: parseXml }
        }, (err, configs) => {
            if (err) return callback(err);

            this.resourceConfigs = configs;
            this.log.debug('Parsing configs');
            try {
                configParser(this.resourceConfigs, this.api.dataSources);
            } catch (e) {
                return callback(e);
            }

            return this._initResources(callback);
        });
    }

    _initResources(callback) {
        this.log.debug('Initializing resources');

        const resources = this.resourceConfigs;

        async.parallel(Object.keys(resources).map(resourceName =>
            (done) => {
                this.log.trace('Initializing resource "' + resourceName + '"');

                // no need for "init" extension for the default resource
                if (!resources[resourceName].instance) return done();

                const resource = resources[resourceName].instance;
                if (resource.extensions && resource.extensions.init && typeof resource.extensions.init === 'function') {
                    this.log.trace('"init" extension (%s)', resourceName);
                    if (resource.extensions.init.length === 0) {
                        // sync
                        resource.extensions.init();
                        return done();
                    }
                    // async
                    return resource.extensions.init(done);
                }
                return done();
            }
        ), callback);
    }

    /**
     * Handle request.
     *
     * @param {Request} request
     * @param {Response} response
     */
    handle(request, response) {
        let resolvedDataSourceTree = null;

        async.waterfall([

            // extension: "request" (resource)
            (callback) => {
                this.log.trace('handle: "request" extensions (resource)');
                const resource = this.api.getResource(request.resource);

                if (resource && resource.extensions && resource.extensions.request) {
                    this.api.log.trace('handle: "request" extension (%s)', request.resource);
                    resource.extensions.request({ request });
                }

                callback(null, request);
            },

            // requestParser
            (req, callback) => {
                this.log.trace('handle: requestParser');

                let profiler;
                let requestAST;
                try {
                    profiler = request._profiler.child('requestParser');
                    requestAST = requestParser.parse(req);
                    profiler.end();
                } catch (e) {
                    profiler.end();
                    return callback(e);
                }

                return callback(null, requestAST);
            },

            // requestResolver
            (requestAST, callback) => {
                this.log.trace('handle: requestResolver');

                let profiler;
                let resolved;
                try {
                    profiler = request._profiler.child('requestResolver');
                    resolved = requestResolver(requestAST, this.resourceConfigs);
                    profiler.end();
                    resolvedDataSourceTree = resolved.dataSourceTree;
                } catch (e) {
                    profiler.end();
                    return callback(e);
                }

                return callback(null, resolved);
            },

            // dataSourceExecutor
            (resolved, callback) => {
                this.log.trace('handle: dataSourceExecutor');

                resolved.dataSourceTree._profiler = request._profiler.child('dataSourceExecutor');
                dataSourceExecutor(this.api, request, resolved.dataSourceTree, (err, rawRes) => {
                    resolved.dataSourceTree._profiler.end();
                    callback(err, resolved, rawRes);
                });
            },

            // resultBuilder
            (resolved, rawResults, callback) => {
                this.log.trace('handle: resultBuilder');

                let profiler;
                let results;
                try {
                    profiler = request._profiler.child('resultBuilder');
                    results = resultBuilder(this.api, request, rawResults, resolved.resolvedConfig);
                    profiler.end();
                } catch (e) {
                    profiler.end();
                    return callback(e);
                }

                if (results.cursor) {
                    response.cursor = results.cursor;
                    if (response.cursor.totalCount === null) delete response.cursor.totalCount;
                    response.cursor.limit = resolved.dataSourceTree.request.limit;
                    response.cursor.page = resolved.dataSourceTree.request.page;

                    if (response.cursor.limit && response.cursor.totalCount) {
                        response.cursor.totalPages =
                            Math.ceil(response.cursor.totalCount / response.cursor.limit);
                    }
                }

                return callback(null, results.data);
            }
        ], (err, data) => {
            // explain even in case of an error:
            if ((request._explain === '1' || request._explain === 'full') && this.api.config.allowExplain) {
                if (!resolvedDataSourceTree) {
                    response.meta.explain = { error: 'Unresolveable request' };
                } else {
                    response.meta.explain = explainDataSourceTree(resolvedDataSourceTree, request._explain === 'full');
                }
            }

            if (err) {
                if (!(err instanceof Error)) {
                    err = new ImplementationError('Invalid error thrown: ' + err);
                }
                return response.send(err);
            }

            return response.send(data);
        });
    }
}

module.exports = ResourceProcessor;

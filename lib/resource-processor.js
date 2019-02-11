'use strict';

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
        explain.subFilters = dst.subFilters.map(subFilter => explainDataSourceTree(subFilter, full));
    }

    // TODO: Move requestName generation into request-resolver:
    const requestName = dst.attributePath ? dst.attributePath.join('.') + ':' + dst.dataSourceName : 'unnamedRequest';

    explain.requestName = requestName;
    explain.type = dst.request.type;

    if (full) {
        explain.attributes = dst.request.attributes ? dst.request.attributes.join(',') : undefined;
        explain.filter = dst.request.filter
            ? dst.request.filter
                  .map(orFilter =>
                      orFilter
                          .map(andFilter => {
                              const operators = {
                                  like: '~',
                                  equal: '=',
                                  notEqual: '!=',
                                  less: '<',
                                  lessOrEqual: '<=',
                                  greater: '>',
                                  greaterOrEqual: '>='
                              };

                              function renderRecursiveArray(array) {
                                  if (!Array.isArray(array)) return array;
                                  return '[' + array.map(renderRecursiveArray).join(',') + ']';
                              }

                              return (
                                  renderRecursiveArray(andFilter.attribute) +
                                  (operators[andFilter.operator]
                                      ? operators[andFilter.operator]
                                      : ' ' + andFilter.operator + ' ') +
                                  renderRecursiveArray(andFilter.value) +
                                  (andFilter.valueFromParentKey ? '{from-parent-key}' : '') +
                                  (has(andFilter, 'valueFromSubFilter')
                                      ? `{from-sub-filter: ${andFilter.valueFromSubFilter}}`
                                      : '')
                              );
                          })
                          .join(' AND ')
                  )
                  .join(' OR ')
            : undefined;
        explain.search = dst.request.search;
        explain.order = dst.request.order
            ? dst.request.order.map(order => order.attribute + ':' + order.direction).join(',')
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
        explain.subRequests = dst.subRequests.map(subRequest => explainDataSourceTree(subRequest, full));
    }

    return explain;
}

/**
 * Provides a clean interface for DataSource configurations and their
 * relations.
 */
class ResourceProcessor {
    /**
     * @param {Api} api - The Api instance context.
     */
    constructor(api) {
        this.log = api.log.child({ component: 'resource-processor' });
        this.api = api;
        this.resourceConfigs = {};
    }

    /**
     * Initialize data sources.
     *
     * @param {Object} config - Configuration object
     * @param {Object} config.resourcePath - Path to resource files
     * @return {Promise}
     */
    async init(config = {}) {
        if (!config.resourcesPath) {
            this.log.warn('No resourcesPath in configuration, not loading any resources');
            return null;
        }

        this.log.debug('Loading configuration');

        const configs = await configLoader(this.api, {
            directory: config.resourcesPath,
            parsers: { xml: parseXml }
        });

        this.resourceConfigs = configs;
        this.log.debug('Parsing configs');
        configParser(this.resourceConfigs, this.api.dataSources);

        return this._initResources();
    }

    _initResources() {
        this.log.debug('Initializing resources');

        const resources = this.resourceConfigs;

        return Promise.all(
            Object.keys(resources).map(
                resourceName =>
                    new Promise(resolve => {
                        this.log.trace('Initializing resource "' + resourceName + '"');

                        // no need for "init" extension for the default resource
                        if (!resources[resourceName].instance) return resolve();

                        // Extension: "init"
                        const resource = resources[resourceName].instance;
                        if (
                            resource.extensions &&
                            resource.extensions.init &&
                            typeof resource.extensions.init === 'function'
                        ) {
                            this.log.trace('"init" extension (%s)', resourceName);
                            resolve(resource.extensions.init());
                        }

                        return resolve();
                    })
            )
        );
    }

    /**
     * Handle a request.
     *
     * @param {Request} request - Request object
     * @param {Response} response - Response object (for modifying header information, etc.)
     * @return {Object}
     */
    async handle(request, response) {
        let resolvedDataSourceTree = null;

        // Extension: "request" (resource)
        this.log.trace('handle: "request" extensions (resource)');
        const resource = this.api.getResource(request.resource);
        if (resource && resource.extensions && resource.extensions.request) {
            this.api.log.trace('handle: "request" extension (%s)', request.resource);
            await resource.extensions.request({ request, response });
        }

        // requestParser
        this.log.trace('handle: requestParser');
        let profiler;
        let requestAST;
        profiler = request._profiler.child('requestParser');
        try {
            requestAST = requestParser.parse(request);
        } finally {
            profiler.end();
        }

        // requestResolver
        this.log.trace('handle: requestResolver');
        let resolved;
        profiler = request._profiler.child('requestResolver');
        try {
            resolved = requestResolver(requestAST, this.resourceConfigs);
            resolvedDataSourceTree = resolved.dataSourceTree;
        } finally {
            profiler.end();
        }

        if (resolved.deprecated) {
            response.meta.deprecated = resolved.deprecated;
            if (Array.isArray(resolved.deprecated)) {
                resolved.deprecated.forEach(attribute => {
                    this.api.status.increment(`deprecated.${request.resource}.${attribute}`);
                    this.api.log.debug(
                        { req: request.httpRequest },
                        `Attribute "${attribute}" in resource "${request.resource}" is deprecated`
                    );
                });
            }
        }

        let results;

        try {
            // dataSourceExecutor
            this.log.trace('handle: dataSourceExecutor');
            resolved.dataSourceTree._profiler = request._profiler.child('dataSourceExecutor');
            let rawResults;
            try {
                rawResults = await dataSourceExecutor(this.api, request, resolved.dataSourceTree);
            } finally {
                resolved.dataSourceTree._profiler.end();
            }

            // resultBuilder
            this.log.trace('handle: resultBuilder');
            profiler = request._profiler.child('resultBuilder');
            try {
                results = resultBuilder(this.api, request, rawResults, resolved.resolvedConfig);
            } finally {
                profiler.end();
            }
        } catch (err) {
            // explain even in case of an error
            if ((request._explain === '1' || request._explain === 'full') && this.api.config.allowExplain) {
                err.meta = err.meta || {};
                err.meta.explain = resolvedDataSourceTree
                    ? explainDataSourceTree(resolvedDataSourceTree, request._explain === 'full')
                    : { error: 'Unresolveable request' };
            }

            throw err;
        }

        if ((request._explain === '1' || request._explain === 'full') && this.api.config.allowExplain) {
            response.meta.explain = resolvedDataSourceTree
                ? explainDataSourceTree(resolvedDataSourceTree, request._explain === 'full')
                : { error: 'Unresolveable request' };
        }

        if (results.cursor) {
            response.cursor = results.cursor;
            if (response.cursor.totalCount === null) delete response.cursor.totalCount;
            response.cursor.limit = resolved.dataSourceTree.request.limit;
            response.cursor.page = resolved.dataSourceTree.request.page;

            if (response.cursor.limit && response.cursor.totalCount) {
                response.cursor.totalPages = Math.ceil(response.cursor.totalCount / response.cursor.limit);
            }
        }

        return results.data;
    }
}

module.exports = ResourceProcessor;

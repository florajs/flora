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
    var timer = request.timer;

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
            var time, requestAST;

            try {
                time = timer.start('requestParser');
                requestAST = requestParser(req);
                time.end();
            } catch (e) {
                time.end();
                return callback(e);
            }

            callback(null, requestAST);
        },

        // requestResolver
        function (requestAST, callback) {
            self.log.trace('handle: requestResolver');
            var time, resolved;

            try {
                time = timer.start('requestResolver');
                resolved = requestResolver(requestAST, self.resourceConfigs);
                time.end();
            } catch (e) {
                time.end();
                return callback(e);
            }

            callback(null, resolved);
        },

        // dataSourceExecutor
        function (resolved, callback) {
            self.log.trace('handle: dataSourceExecutor');
            var time = timer.start('dataSourceExecutor');
            resolved.dataSourceTree._timer = time;
            dataSourceExecutor(self.api, request, resolved.dataSourceTree, function (err, rawResults) {
                time.end();
                callback(err, resolved, rawResults);
            });
        },

        // resultBuilder
        function (resolved, rawResults, callback) {
            self.log.trace('handle: resultBuilder');
            var time, results;

            try {
                time = timer.start('resultBuilder');
                results = resultBuilder(self.api, request, rawResults, resolved.resolvedConfig);
                time.end();
            } catch (e) {
                time.end();
                return callback(e);
            }

            response.cursor = results.cursor;

            callback(null, results.data);
        }

    ], function (err, data) {
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

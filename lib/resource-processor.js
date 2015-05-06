'use strict';

var async = require('async');
var configLoader = require('./config-loader');
var parseXml = require('./xml-reader');
var configParser = require('./config-parser');
var requestParser = require('./request-parser');
var requestResolver = require('./request-resolver');
var dataSourceExecutor = require('./datasource-executor');
var resultBuilder = require('./result-builder');

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
        if (err) {
            self.log.error(err, 'Error initializing resource-processor');
            return callback(err);
        }

        self.resourceConfigs = configs;
        self.log.debug('Parsing configs');
        configParser(self.resourceConfigs, self.api.dataSources);
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

        // requestParser
        function (callback) {
            self.log.trace('handle: requestParser');
            var time, requestAST;

            try {
                time = timer.start('requestParser');
                requestAST = requestParser(request);
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

        // extension: "preExecute" (global)
        function (resolved, callback) {
            self.log.trace('handle: "preExecute" extensions (global)');
            self.api.emit('preExecute', resolved.dataSourceTree, function (err) {
                callback(err, resolved);
            });
        },

        // dataSourceExecutor
        function (resolved, callback) {
            self.log.trace('handle: dataSourceExecutor');
            dataSourceExecutor(self.api, resolved.dataSourceTree, function (err, rawResults) {
                callback(err, resolved, rawResults);
            });
        },

        // extension: "postExecute" (global)
        function (resolved, rawResults, callback) {
            self.log.trace('handle: "postExecute" extensions (global)');
            self.api.emit('postExecute', rawResults, function (err) {
                callback(err, resolved, rawResults);
            });
        },

        // resultBuilder
        function (resolved, rawResults, callback) {
            self.log.trace('handle: resultBuilder');
            var time, results;

            try {
                time = timer.start('resultBuilder');
                results = resultBuilder(self.api, rawResults, resolved.resolvedConfig);
                time.end();
            } catch (e) {
                time.end();
                return callback(e);
            }

            response.cursor = results.cursor;

            callback(null, results.data);
        }

    ], function (err, data) {
        timer.end();

        if (err) {
            self.log.debug(err, 'handle: error');
            return response.send(err);
        }

        response.send(data);
    });
};

module.exports = ResourceProcessor;

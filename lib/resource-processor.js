'use strict';

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
    this._resourceConfigs = {};
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

        self._resourceConfigs = configs;
        self.log.debug('Parsing configs');
        configParser(self._resourceConfigs, self.api.dataSources);
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
    var requestAST, resolved, time;

    var timer = request.timer;
    var log = this.log;

    var self = this;

    try {
        time = timer.start('requestParser');
        requestAST = requestParser(request);
        time.end();

        time = timer.start('requestResolver');
        resolved = requestResolver(requestAST, self._resourceConfigs);
        time.end();
    } catch (err) {
        log.error('Error handling request', err);
        timer.end();
        return response.send(err);
    }

    time = timer.start('dataSourceExecutor');
    log.trace('executing request');
    dataSourceExecutor(resolved.dataSourceTree, this.api.dataSources, function (err, rawResults) {
        time.end();

        if (err) {
            log.trace('sending error response');
            timer.end();
            return response.send(err);
        }

        time = timer.start('resultBuilder');
        var results = resultBuilder(rawResults, resolved.resolvedConfig);
        time.end();

        response.cursor = results.cursor;
        timer.end();
        response.send(results.data);
    });
};

module.exports = ResourceProcessor;

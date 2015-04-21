'use strict';

var async = require('async');
var bunyan = require('bunyan');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var ResourceProcessor = require('./resource-processor');
var Response = require('./response');
var RequestError = require('flora-errors').RequestError;

/**
 * The main API entry point.
 * Provides the "execute" function that actually executes a {@link Request|request}
 *
 * @constructor
 */
function Api() {
    this.config = null;
    this.resourceProcessor = null;
    this.log = null;
    this.dataSources = {};
    this.clusterWorker = null;

    this._resources = {};
    this._defaultResource = null;
}

util.inherits(Api, EventEmitter);

/**
 * Initialize and handle the config.
 *
 * @param {Object=} config             - API configuration
 * @param {Object=} config.dataSources - Available data sources
 * @param {Object=} config.log         - {@link https://github.com/trentm/node-bunyan|Bunyan} logger instance
 * @param {Function} callback
 */
Api.prototype.init = function init(config, callback) {
    callback = callback || function () {};

    this.config = config || {};
    this.log = this.config.log || bunyan.createLogger({name: 'flora'});

    if (this.config.dataSources) {
        this.log.debug('Registering data sources');
        for (var name in config.dataSources) {
            var ds = config.dataSources[name];
            this.log.trace('Registering data source "%s"', name);
            if (typeof ds !== 'object') {
                return callback(new Error('Data source configuration for "' + name + '" needs to be an object'));
            }
            if (typeof ds.constructor !== 'function') {
                return callback(new Error(
                    'Data source configuration for "' + name + '" does not have a constructor function'
                ));
            }
            this.dataSources[name] = new ds.constructor(this, ds.options);
        }
    }

    this.resourceProcessor = new ResourceProcessor(this);
    this.resourceProcessor.init(this.config, function (err) {
        if (err) return callback(err);
        callback(null);
    });

    this.emit('init');
};

/**
 * Gracefully shutdown the instance.
 *
 * @param {Function} callback
 */
Api.prototype.close = function (callback) {
    callback = callback || function () {};
    var self = this;

    if (!this.log) {
        // Tried to close the instance before `init` was done
        this.once('close', function () {
            callback(new Error('Not running'));
        });
        this.emit('close');
        return;
    }

    this.log.debug('Closing API instance');

    async.parallel(Object.keys(this.dataSources).map(function (name) {
        var ds = self.dataSources[name];
        return function (next) {
            if (typeof ds.close !== 'function') return next();
            self.log.trace('Closing data source "%s"', name);
            ds.close(next);
        };
    }), function (err) {
        if (err) return callback(err);
        self.emit('close');
        callback();
    });
};

/**
 * Execute a request.
 *
 * @param {Request} request     - Request to process
 * @param {Function} callback
 */
Api.prototype.execute = function execute(request, callback) {
    this.log.debug(request, 'executing request');

    var response = new Response(request, callback);
    var resource = this.getResource(request.resource);

    if (resource.actions.hasOwnProperty(request.action) &&
        typeof resource.actions[request.action] === 'function') {
        (resource.actions[request.action])(request, response);
    } else {
        callback(new RequestError('Action "' + request.action + '" is not implemented'));
    }
};

/**
 * Retrieve a (cached) resource instance (or the default resource).
 *
 * @param {String} resource
 * @returns {Object}
 */
Api.prototype.getResource = function (resource) {
    if (!this._resources.hasOwnProperty(resource)) {
        var filename;
        try {
            filename = require.resolve(this.config.resourcesPath + '/' + resource);
        } catch (e) {}

        if (filename) {
            // regular resource
            this.log.debug('Instantiating ' + filename + ' resource');
            this._resources[resource] = require(filename)(this);
        } else {
            // default resource
            this.log.debug('Instantiating default-resource');
            this._resources[resource] = null;
            if (!this._defaultResource) this._defaultResource = require('./default-resource')(this);
        }
    }

    if (this._resources[resource] === null) {
        return this._defaultResource;
    }

    return this._resources[resource];
};

module.exports = Api;

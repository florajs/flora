'use strict';

var async = require('async');
var bunyan = require('bunyan');
var AsyncEventEmitter = require('async-eventemitter');
var util = require('util');
var ResourceProcessor = require('./resource-processor');
var Response = require('./response');
var Status = require('flora-cluster').Status;
var RequestError = require('flora-errors').RequestError;
var NotFoundError = require('flora-errors').NotFoundError;

/**
 * The main API entry point.
 * Provides the "execute" function that actually executes a {@link Request|request}
 *
 * @constructor
 */
function Api() {
    AsyncEventEmitter.call(this);

    this.config = null;
    this.resourceProcessor = null;
    this.log = null;
    this.dataSources = {};
    this.clusterWorker = null;

    this._initialized = false;
    this._resources = {};
    this._defaultResource = null;
}

util.inherits(Api, AsyncEventEmitter);

/**
 * Initialize and handle the config.
 *
 * @param {Object=} config             - API configuration
 * @param {Object=} config.dataSources - Available data sources
 * @param {Object=} config.log         - {@link https://github.com/trentm/node-bunyan|Bunyan} logger instance
 * @param {Function} callback
 */
Api.prototype.init = function init(config, callback) {
    var self = this;

    callback = callback || function () {};

    this.config = config || {};
    this.log = this.config.log || bunyan.createLogger({name: 'flora'});
    this.status = this.clusterWorker ? this.clusterWorker.status : new Status();

    if (this.config.dataSources) {
        this.log.debug('Registering data sources');
        var status = this.status.child('dataSources');
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
            ds.options = ds.options || {};
            ds.options._status = status.child(name);
            this.dataSources[name] = new ds.constructor(this, ds.options);
        }
    }

    this.resourceProcessor = new ResourceProcessor(this);
    this.resourceProcessor.init(this.config, function (err) {
        if (err) return callback(err);
        self._initialized = true;
        self.emit('init', callback);
    });
};

/**
 * Gracefully shutdown the instance.
 *
 * @param {Function=} callback
 */
Api.prototype.close = function (callback) {
    callback = callback || function () {};
    var self = this;

    if (!this._initialized) {
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
        self.emit('close', callback);
    });
};

/**
 * Execute a request.
 *
 * @param {Request} request     - Request to process
 * @param {Function} callback
 */
Api.prototype.execute = function execute(request, callback) {
    var self = this;

    if (!this._initialized) {
        return callback(new Error('Not initialized'));
    }

    var response = new Response(request, function (err, data) {
        if (err) return callback(err);

        // extension: "response" (resource scope)
        var resource = self.getResource(request.resource);
        if (resource && resource.extensions && resource.extensions.response) {
            resource.extensions.response({request: request, response: response});
        }

        // extension: "response"
        self.emit('response', {request: request, response: response}, function (extErr) {
            if (extErr) return callback(extErr);
            return callback(null, data);
        });
    });

    this.log.debug(request, 'executing request');

    // extension: "request"
    this.emit('request', {request: request}, function (err) {
        if (err) return callback(err);

        var resource = self.getResource(request.resource);
        if (!resource) {
            return callback(new NotFoundError('Unknown resource "' + request.resource + '" in request'));
        }

        if (resource.actions && resource.actions.hasOwnProperty(request.action) &&
            typeof resource.actions[request.action] === 'function') {
            (resource.actions[request.action])(request, response);
        } else {
            callback(new RequestError('Action "' + request.action + '" is not implemented'));
        }
    });
};

/**
 * Retrieve a (cached) resource instance (or the default resource).
 *
 * @param {String} resource
 * @returns {Object}|null
 */
Api.prototype.getResource = function (resource) {
    if (!this._resources.hasOwnProperty(resource)) {
        var filename;
        try {
            filename = require.resolve(this.config.resourcesPath + '/' + resource);
        } catch (e) {}

        if (filename) {
            // regular resource
            this.log.debug('Instantiating ' + resource + ' resource');
            this._resources[resource] = require(filename)(this);
        } else {
            // default resource
            this.log.debug('Instantiating default-resource');
            this._resources[resource] = null;
            if (!this._defaultResource) this._defaultResource = require('./default-resource')(this);
        }
    }

    if (this._resources[resource] === null) {
        if (this.resourceProcessor.resourceConfigs.hasOwnProperty(resource)) {
            return this._defaultResource;
        } else {
            return null;
        }
    }

    return this._resources[resource];
};

module.exports = Api;

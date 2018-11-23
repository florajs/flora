'use strict';

const bunyan = require('bunyan');
const PromiseEventEmitter = require('promise-events');
const { Status } = require('flora-cluster');
const { NotFoundError, RequestError } = require('flora-errors');
const moment = require('moment-timezone');
const has = require('has');

const asciiArtProfile = require('./ascii-art-profile');
const ResourceProcessor = require('./resource-processor');
const Response = require('./response');
const defaultResource = require('./default-resource');

/**
 * @event Api#init
 * @description Emitted after data sources have been initialized and the instance is ready.
 */

/**
 * @event Api#close
 * @description Emitted when the instance has closed.
 */

/**
 * @event Api#request
 * @description Emitted before a request is handled.
 * @type {Object}
 * @property {Request} request - The request that is being executed.
 * @property {Response} response - The response object that is being passed to the request handler.
 */

/**
 * @event Api#response
 * @description Emitted before a response is returned by the execute() method.
 * @type {Object}
 * @property {Request} request - The request was executed.
 * @property {Response} response - The response object that was returned.
 */

/**
 * The main API entry point.
 * Provides the "execute" function that actually executes a {@link Request|Request}
 */
class Api extends PromiseEventEmitter {
    constructor() {
        super();

        this.config = null;
        this.resourceProcessor = null;
        this.log = null;
        this.dataSources = {};
        this.clusterWorker = null;

        this._initialized = false;
        this._defaultResourceInstance = null;
    }

    /**
     * Initialize and handle the config.
     *
     * @param {Object} [config] - API configuration
     * @param {Object} [config.dataSources] - Available data sources
     * @param {Object} [config.log] - {@link https://github.com/trentm/node-bunyan|Bunyan} logger instance
     * @returns {Promise}
     * @fires Api#init
     */
    async init(config) {
        this.config = config || {};
        this.log = this.config.log || bunyan.createLogger({ name: 'flora' });
        this.status = this.clusterWorker ? this.clusterWorker.status : new Status();

        if (this.config.dataSources) {
            this.log.debug('Registering data sources');
            const status = this.status.child('dataSources');

            Object.keys(this.config.dataSources).forEach((name) => {
                const ds = config.dataSources[name];
                this.log.trace(`Registering data source "${name}"`);
                if (typeof ds !== 'object') {
                    throw new Error(`Data source configuration for "${name}" needs to be an object`);
                }
                if (typeof ds.constructor !== 'function') {
                    throw new Error(`Data source configuration for "${name}" does not have a constructor function`);
                }
                ds.options = ds.options || {};
                ds.options._status = status.child(name);
                this.dataSources[name] = new ds.constructor(this, ds.options);
            });
        }

        if (this.config.timezone) {
            const zone = moment.tz.zone(this.config.timezone);
            if (!zone) throw new Error(`Timezone "${this.config.timezone}" does not exist`);
            this.log.debug(`Using timezone "${zone.name}"`);
        } else {
            this.log.warn('No timezone is set, using default "UTC"');
        }

        this.resourceProcessor = new ResourceProcessor(this);
        try {
            await this.resourceProcessor.init(this.config);
        } catch (err) {
            await this.emit('close');
            throw err;
        }

        this._defaultResourceInstance = defaultResource(this);
        this._initialized = true;
        return this.emit('init');
    }

    /**
     * Gracefully shutdown the instance.
     *
     * @returns {Promise}
     * @fires Api#close
     */
    async close() {
        if (!this._initialized) {
            // Tried to close the instance before `init` was done
            return new Promise((resolve, reject) => {
                this.once('close', () => reject(new Error('Not running')));
                this.emit('close');
            });
        }

        this.log.info('Closing API instance');

        await Promise.all(Object.keys(this.dataSources).map(async (name) => {
            const ds = this.dataSources[name];
            if (!ds.close) return;
            try {
                await ds.close();
            } catch (err) {
                this.log.warn(err, `Error closing data source "${name}"`);
            }
        }));

        this.log.info('Closed API instance');
        return this.emit('close');
    }

    /**
     * Execute a request and return the response.
     *
     * @param {Request} request - Request to process
     * @returns {Promise<Object>}
     * @fires Api#request
     * @fires Api#response
     */
    async execute(request) {
        if (!this._initialized) throw new Error('Not initialized');

        const response = new Response(request);

        this.log.debug(request, 'executing request');

        await this.emit('request', { request, response });

        const resource = this.getResource(request.resource);
        if (!resource) throw new NotFoundError(`Unknown resource "${request.resource}" in request`);

        if (!resource.actions || !has(resource.actions, request.action)) {
            throw new RequestError(`Action "${request.action}" is not implemented`);
        }

        let ret;
        try {
            const method = request.format === 'json' ? 'default' : request.format;
            if (method === 'default' && typeof resource.actions[request.action] === 'function') {
                ret = await (resource.actions[request.action])(request, response);
            } else {
                if (typeof resource.actions[request.action] !== 'object') {
                    throw new RequestError(`Invalid format "${request.format}" for action "${request.action}"`);
                }
                if (!has(resource.actions[request.action], method)
                    || typeof resource.actions[request.action][method] !== 'function') {
                    throw new RequestError(`Invalid format "${request.format}" for action "${request.action}"`);
                }
                ret = await (resource.actions[request.action][method])(request, response);
            }
        } catch (err) {
            if (err.httpStatusCode && err.httpStatusCode < 500) {
                this.log.info({ err, req: request._httpRequest }, 'Request error');
            } else {
                this.log.error({ err, req: request._httpRequest }, 'Server error');
            }
            throw err;
        }

        if (typeof ret !== 'undefined') response.data = ret;

        // Stop profiler
        request._profiler.end();
        response.meta.duration = request._profiler.getDuration();

        if (request._profile === 'raw' || request._profile === '1') {
            const profile = this.request._profiler.report();

            if (request._profile === 'raw') {
                response.meta.profile = profile;
            } else {
                response.meta.profile = asciiArtProfile(profile, response.meta.duration, 100);
            }
        }

        // Extension: "response" (resource scope)
        if (resource.extensions && resource.extensions.response) {
            await resource.extensions.response({ request, response });
        }

        await this.emit('response', { request, response });

        return response;
    }

    /**
     * Retrieve the resource instance (or the default resource).
     * Returns null if the resource was not found.
     *
     * @param {String} resource - Resource name
     * @returns {Object|null}
     */
    getResource(resource) {
        if (!this.resourceProcessor.resourceConfigs[resource]) return null;
        return this.resourceProcessor.resourceConfigs[resource].instance
            || this._defaultResourceInstance;
    }

    /**
     * Register a plugin.
     *
     * The plugin has to be an object with a "register" method, which is called with
     * parameters (api, options).
     *
     * @param {Object} plugin - Plugin object with "register" method
     * @param {Object} [options] - Configuration options that are passed to the register method
     */
    register(plugin, options) {
        if (typeof plugin !== 'object' || typeof plugin.register !== 'function') {
            throw new Error('The plugin must provide a "register" function');
        }
        plugin.register(this, options);
    }
}

module.exports = Api;

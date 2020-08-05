'use strict';

const bunyan = require('bunyan');
const PromiseEventEmitter = require('promise-events');
const { Status } = require('flora-cluster');
const { NotFoundError, RequestError } = require('flora-errors');
const moment = require('moment-timezone');
const has = require('has');

const asciiArtProfile = require('./ascii-art-profile');
const ResourceProcessor = require('./resource-processor');
const Request = require('./request');
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
 * Get an object with profiler information.
 *
 * @param {Request} request
 * @returns {Object}
 * @private
 */
function getProfilerMeta(request) {
    const meta = {
        duration: request._profiler.getDuration()
    };

    if (request._profile === 'raw' || request._profile === '1') {
        const profile = request._profiler.report();

        if (request._profile === 'raw') {
            meta.profile = profile;
        } else {
            meta.profile = asciiArtProfile(profile, meta.duration, 100);
        }
    }

    return meta;
}

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
        this.plugins = {};
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
            this.log.debug('No timezone is set, using default "UTC"');
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

        await Promise.all(
            Object.keys(this.dataSources).map(async (name) => {
                const ds = this.dataSources[name];
                if (!ds.close) return;
                try {
                    await ds.close();
                } catch (err) {
                    this.log.warn(err, `Error closing data source "${name}"`);
                }
            })
        );

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

        request = new Request(request); // clone, as parser works in-place
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
                ret = await resource.actions[request.action](request, response);
            } else {
                if (typeof resource.actions[request.action] !== 'object') {
                    throw new RequestError(`Invalid format "${request.format}" for action "${request.action}"`);
                }
                if (
                    !has(resource.actions[request.action], method) ||
                    typeof resource.actions[request.action][method] !== 'function'
                ) {
                    throw new RequestError(`Invalid format "${request.format}" for action "${request.action}"`);
                }
                ret = await resource.actions[request.action][method](request, response);
            }

            request._profiler.end();
            Object.assign(response.meta, getProfilerMeta(request));
        } catch (err) {
            if (err.httpStatusCode && err.httpStatusCode < 500) {
                this.log.info(
                    { err, req: request._httpRequest },
                    `Request error (${request.resource}/${request.id || ''}.${request.format}?do=${request.action})`
                );
            } else {
                this.log.error({ err, req: request._httpRequest }, 'Server error');
            }

            request._profiler.end();
            err.meta = err.meta || {};
            Object.assign(err.meta, getProfilerMeta(request));

            throw err;
        }

        if (typeof ret !== 'undefined') response.data = ret;

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
        return this.resourceProcessor.resourceConfigs[resource].instance || this._defaultResourceInstance;
    }

    /**
     * Register a plugin.
     *
     * The plugin has to be a function, which is called with parameters (api, options).
     *
     * @param {string} name - Plugin name
     * @param {function} plugin - Plugin function
     * @param {Object} [options] - Configuration options that are passed to the function
     */
    register(name, plugin, options) {
        if (this.plugins[name]) throw new Error(`Plugin "${name}" already registered.`);
        if (typeof plugin !== 'function') throw new Error('Plugin needs to be a function');

        this.plugins[name] = plugin(this, options);
    }

    /**
     * Retrieve plugin data/instance.
     *
     * Returns whatever the plugin function returned at registration time.
     *
     * @param {string} name - Plugin name
     * @throws Error when no plugin is registered with this name
     * @returns {*}
     */
    getPlugin(name) {
        if (!has(this.plugins, name)) throw new Error(`Plugin "${name}" is not registered`);
        return this.plugins[name];
    }
}

module.exports = Api;

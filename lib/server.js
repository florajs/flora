'use strict';

const http = require('http');
const zlib = require('zlib');
const Stream = require('stream');

const serveStatic = require('serve-static');
const ClusterWorker = require('@florajs/cluster').Worker;
const errors = require('@florajs/errors');

const Api = require('./api');
const Response = require('./response');
const httpToFloraRequest = require('./url-parser');

const NotFoundError = errors.NotFoundError;

/**
 * @event Api#httpRequest
 * @description Emitted before a HTTP request is handled.
 * @type {Object}
 * @property {http.IncomingMessage} httpRequest - The HTTP server request.
 * @property {http.ServerResponse} httpResponse - The HTTP response object.
 */

/**
 * Server (or cluster worker) process.
 *
 * Provides a {@link https://nodejs.org/api/http.html#http_class_http_server|HTTP server} that listens to a specific
 * port and handles requests.
 */
class Server {
    /**
     * @param {string} configPath - Location of resource configs
     */
    constructor(configPath) {
        if (!configPath) throw new Error('Master must be called with a configPath parameter');

        this.api = null;
        this.log = null;

        this._httpServer = null;
        this._staticHandler = null;
        this._configPath = require.resolve(configPath);
        this._clusterWorker = null;
        this._plugins = {};
    }

    /**
     * Run the worker process.
     *
     * Initializes a new instance of {@link Api} by resolving the configPath supplied
     * in the constructor. Attaches to a @florajs/cluster worker (if we are in a cluster)
     * and creates a new {@link https://nodejs.org/api/http.html#http_class_http_server|HTTP server}.
     *
     * @returns {Promise}
     */
    async run() {
        // eslint-disable-next-line global-require
        const config = require(this._configPath);

        this._clusterWorker = new ClusterWorker({
            shutdownTimeout: config.shutdownTimeout,
            log: config.log
        });

        this.api = new Api();
        this.api.clusterWorker = this._clusterWorker;

        try {
            await this.api.init(config);
        } catch (err) {
            if (this.api.log) this.api.log.fatal(err, 'Error initializing Flora');
            this._clusterWorker.shutdown();
            throw err;
        }

        this.log = this.api.log;

        Object.keys(this._plugins).forEach((name) => {
            const [plugin, options] = this._plugins[name];
            this.log.debug(`Registering plugin "${name}"`);
            this.api.register(name, plugin, options);
        });

        if (config.staticPath) {
            this._staticHandler = serveStatic(config.staticPath);
        }

        if (!config.port) {
            this.log.warn('No port in configuration, not starting HTTP server');
            return null;
        }

        this._httpServer = http.createServer(this._handleRequest.bind(this));

        this._clusterWorker.on('close', () => this.close());

        this._clusterWorker.attach(this._httpServer);

        return new Promise((resolve) => {
            this._httpServer.listen(config.port, () => {
                this._clusterWorker.ready();
                this.log.info('Flora server running on port %d', config.port);
                resolve();
            });
        });
    }

    /**
     * Gracefully shutdown the server.
     *
     * @returns {Promise}
     */
    async close() {
        if (!this.api) throw new Error('Not running');

        if (this._httpServer) {
            this.log.info('Closing HTTP server');

            // TODO: Callback will get the error from httpServer#close,
            // regardless what Api#close returns.);
            return new Promise((resolve) => this._httpServer.close(() => resolve(this.api.close())));
        }

        return this.api.close();
    }

    /**
     * Register a plugin.
     *
     * The plugin has to be a function, which is called with parameters (api, options).
     *
     * @param {string} name - Plugin name
     * @param {Object} function - Plugin function
     * @param {Object} [options] - Configuration options that are passed to the function
     */
    register(name, plugin, options) {
        if (this._plugins[name]) throw new Error(`Plugin "${name}" already registered.`);
        this._plugins[name] = [plugin, options];
        if (this.api) this.api.register(name, plugin, options);
    }

    /**
     * Handle a HTTP request.
     *
     * Parse the request path and parameters, search for the required resource
     * and execute the resource, build and send the response.
     *
     * @param {http.IncomingMessage} httpRequest
     * @param {http.ServerResponse} httpResponse
     * @returns {Promise}
     * @fires Api#httpRequest
     * @private
     */
    async _handleRequest(httpRequest, httpResponse) {
        try {
            await this.api.emit('httpRequest', { httpRequest, httpResponse });

            if (httpRequest.method === 'OPTIONS') {
                // Abort execution of OPTIONS requests here, send 200 for now
                httpResponse.writeHead(200);
                return httpResponse.end();
            }

            const floraRequest = await httpToFloraRequest(httpRequest, { postTimeout: this.api.config.postTimeout });
            if (!floraRequest) {
                if (this._staticHandler) {
                    return this._staticHandler(httpRequest, httpResponse, () => {
                        this._sendError(
                            new NotFoundError(`URL "${httpRequest.url}" not found (not a valid resource url)`),
                            httpRequest,
                            httpResponse
                        );
                    });
                }
                return this._sendError(
                    new NotFoundError(`URL "${httpRequest.url}" not found (not a valid resource url)`),
                    httpRequest,
                    httpResponse
                );
            }

            if (!this.api.getResource(floraRequest.resource) && this._staticHandler) {
                return this._staticHandler(httpRequest, httpResponse, () => {
                    this._sendError(
                        new NotFoundError(`Resource "${floraRequest.resource}" not found`),
                        httpRequest,
                        httpResponse
                    );
                });
            }

            const response = await this.api.execute(floraRequest);
            return this._sendResponse(response, httpRequest, httpResponse);
        } catch (err) {
            this._sendError(err, httpRequest, httpResponse);
        }

        return null;
    }

    /**
     * @param {FloraError} err
     * @param {http.Request} httpRequest
     * @param {http.Response} httpResponse
     * @private
     */
    _sendError(err, httpRequest, httpResponse) {
        const response = new Response();

        if (err.data) response.data = err.data;
        if (err.meta) Object.assign(response.meta, err.meta);
        response.meta.statusCode = err.httpStatusCode || new errors.FloraError().httpStatusCode;
        response.error = errors.format(err, { exposeErrors: this.api.config.exposeErrors });

        this._sendResponse(response, httpRequest, httpResponse);
    }

    /**
     * @param {Object} response
     * @param {http.Request} httpRequest
     * @param {http.Response} httpResponse
     * @private
     */
    _sendResponse(response, httpRequest, httpResponse) {
        const { headers = {} } = response.meta;
        let stream = httpResponse;
        const acceptEncoding = httpRequest.headers['accept-encoding'] || '';

        if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8';

        if (acceptEncoding.match(/\bgzip\b/)) {
            headers['content-encoding'] = 'gzip';
            stream = zlib.createGzip();
            stream.pipe(httpResponse);
        } else if (acceptEncoding.match(/\bdeflate\b/)) {
            headers['content-encoding'] = 'deflate';
            stream = zlib.createDeflate();
            stream.pipe(httpResponse);
        }

        try {
            let json = null;

            if (!(response.data instanceof Stream.Readable) && !(response.data instanceof Buffer)) {
                json = JSON.stringify({
                    meta: response.meta,
                    cursor: response.cursor,
                    error: response.error,
                    data: response.data
                });
            }

            // measure duration as late as possible - after JSON.stringify, right before writeHead:
            if (httpRequest.flora && httpRequest.flora.startTime) {
                const hrtime = process.hrtime(httpRequest.flora.startTime);
                headers['x-response-time'] = Math.round((hrtime[0] * 1000 + hrtime[1] / 1000000) * 1000) / 1000;
            }

            httpResponse.writeHead(response.meta.statusCode, headers);

            if (response.data instanceof Stream.Readable) {
                response.data.pipe(stream);
                return;
            }

            stream.end(json || response.data);
        } catch (e) {
            this.log.warn(e, 'Error while sending response');
        }
    }
}

module.exports = Server;

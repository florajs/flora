'use strict';

const http = require('http');
const zlib = require('zlib');
const Stream = require('stream');

const serveStatic = require('serve-static');
const ClusterWorker = require('flora-cluster').Worker;
const errors = require('flora-errors');

const Api = require('./api');
const Response = require('./response');
const httpToFloraRequest = require('./url-parser');

const NotFoundError = errors.NotFoundError;

/**
 * Server (or cluster worker) process.
 *
 * Provides a {@link https://nodejs.org/api/http.html#http_class_http_server|HTTP server} that listens to a specific
 * port and handles requests.
 */
class Server {
    /**
     * @param {string} configPath   - Location of resource configs
     */
    constructor(configPath) {
        if (!configPath) throw new Error('Master must be called with a configPath parameter');

        this.api = null;
        this.log = null;

        this._httpServer = null;
        this._staticHandler = null;
        this._configPath = require.resolve(configPath);
        this._clusterWorker = null;
        this._plugins = [];
    }

    /**
     * Run the worker process.
     *
     * Initializes a new instance of {@link Api} by resolving the configPath supplied
     * in the constructor. Attaches to a flora-cluster worker (if we are in a cluster)
     * and creates a new {@link https://nodejs.org/api/http.html#http_class_http_server|HTTP server}.
     *
     * @param {Function} callback
     */
    run(callback) {
        // eslint-disable-next-line global-require,import/no-dynamic-require
        const config = require(this._configPath);

        this._clusterWorker = new ClusterWorker({
            shutdownTimeout: config.shutdownTimeout,
            log: config.log
        });

        this.api = new Api();
        this.api.clusterWorker = this._clusterWorker;
        this.api.init(config, (err) => {
            this.log = this.api.log;

            if (err) {
                this.log.fatal(err, 'Error initializing Flora');
                if (callback) callback(err);
                return;
            }

            this._plugins.forEach((plugin) => {
                const [obj, options] = plugin;
                this.log.debug(`Registering plugin "${obj.name || '(unnamed)'}"`);
                obj.register(this.api, options);
            });

            if (config.staticPath) {
                this._staticHandler = serveStatic(config.staticPath);
            }

            if (!config.port) {
                this.log.warn('No port in configuration, not starting HTTP server');
                if (callback) callback(null);
                return;
            }

            this._httpServer = http.createServer(this._handleRequest.bind(this));

            this._clusterWorker.on('close', () => this.close());

            this._clusterWorker.attach(this._httpServer);

            this._httpServer.listen(config.port, () => {
                this._clusterWorker.ready();
                this.log.info('Flora server running on port %d', config.port);
                if (callback) callback(null);
            });
        });
    }

    /**
     * Gracefully shutdown the server.
     *
     * @param {Function=} callback
     */
    close(callback) {
        callback = callback || function nop() {};

        if (!this.api) return callback(new Error('Not running'));

        if (this._httpServer) {
            this.log.info('Closing HTTP server');
            return this._httpServer.close((err) => {
                // Callback will get the error from httpServer#close,
                // regardless what Api#close returns.);
                this.api.close(() => callback(err));
            });
        }

        return this.api.close(callback);
    }

    /**
     * Register a plugin.
     *
     * The plugin has to be an object with a "register" function property, which is called with
     * parameters (api, options).
     *
     * @param {Object} plugin
     * @param {Object} options
     */
    register(plugin, options) {
        this._plugins.push([plugin, options]);
        if (this.api) this.api.register(plugin, options);
    }

    /**
     * Handle a HTTP request.
     *
     * Parse the request path and parameters, search for the required resource
     * and execute the resource, build and send the response.
     *
     * @param {http.Request} httpRequest
     * @param {http.Response} httpResponse
     * @private
     */
    _handleRequest(httpRequest, httpResponse) {
        let floraRequest;

        try {
            floraRequest = httpToFloraRequest(httpRequest);
        } catch (err) {
            return this._sendError(err, httpRequest, httpResponse);
        }

        if (!floraRequest) {
            if (this._staticHandler) {
                return this._staticHandler(httpRequest, httpResponse, () => {
                    this._sendError(
                        new NotFoundError(`URL "${httpRequest.url}" not found (not a valid resource url)`),
                        httpRequest, httpResponse);
                });
            }
            return this._sendError(
                new NotFoundError(`URL "${httpRequest.url}" not found (not a valid resource url)`),
                httpRequest, httpResponse);
        }

        if (!this.api.getResource(floraRequest.resource) && this._staticHandler) {
            return this._staticHandler(httpRequest, httpResponse, () => {
                this._sendError(
                    new NotFoundError(`Resource "${floraRequest.resource}" not found`),
                    httpRequest, httpResponse);
            });
        }

        return this.api.execute(floraRequest, (err, response) => {
            if (err) {
                err.response = response;
                return this._sendError(err, httpRequest, httpResponse);
            }
            return this._sendResponse(response, httpRequest, httpResponse);
        });
    }

    /**
     * @param {FloraError} err
     * @param {http.Request} httpRequest
     * @param {http.Response} httpResponse
     * @private
     */
    _sendError(err, httpRequest, httpResponse) {
        const response = err.response || new Response();
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
        const headers = response.meta.headers;
        let stream = httpResponse;
        const acceptEncoding = httpRequest.headers['accept-encoding'] || '';

        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json; charset=utf-8';

        if (acceptEncoding.match(/\bgzip\b/)) {
            headers['Content-Encoding'] = 'gzip';
            stream = zlib.createGzip();
            stream.pipe(httpResponse);
        } else if (acceptEncoding.match(/\bdeflate\b/)) {
            headers['Content-Encoding'] = 'deflate';
            stream = zlib.createDeflate();
            stream.pipe(httpResponse);
        }

        try {
            let json = null;

            if (!(response.data instanceof Stream.Readable)) {
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
                headers['X-Response-Time'] = Math.round(((hrtime[0] * 1000) + (hrtime[1] / 1000000)) * 1000) / 1000;
            }

            httpResponse.writeHead(response.meta.statusCode, headers);

            if (json !== null) {
                stream.end(json);
            } else {
                response.data.pipe(stream);
            }
        } catch (e) {
            this.log.warn(e, 'Error while sending response');
        }
    }
}

module.exports = Server;

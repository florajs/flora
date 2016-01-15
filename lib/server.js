'use strict';

var http = require('http');
var zlib = require('zlib');
var serveStatic = require('serve-static');
var ClusterWorker = require('flora-cluster').Worker;
var Api = require('./api');
var Request = require('./request');
var Response = require('./response');
var errors = require('flora-errors');
var NotFoundError = errors.NotFoundError;
var Stream = require('stream');
var httpToFloraRequest = require('./url-parser');

/**
 * Server (or cluster worker) process.
 *
 * Provides a {@link https://nodejs.org/api/http.html#http_class_http_server|HTTP server} that listens to a specific
 * port and handles requests.
 *
 * @constructor
 * @param {string} configPath   - Location of resource configs
 */
var Server = module.exports = function Server(configPath) {
    this.api = null;
    this.log = null;

    this._httpServer = null;
    this._staticHandler = null;
    this._configPath = require.resolve(configPath);
    this._clusterWorker = null;
    this._plugins = [];
};

/**
 * Run the worker process.
 *
 * Initializes a new instance of {@link Api} by resolving the configPath supplied
 * in the constructor. Attaches to a flora-cluster worker (if we are in a cluster)
 * and creates a new {@link https://nodejs.org/api/http.html#http_class_http_server|HTTP server}.
 *
 * @param {Function} callback
 */
Server.prototype.run = function (callback) {
    var config = require(this._configPath);
    var self = this;

    this._clusterWorker = new ClusterWorker({
        shutdownTimeout: config.shutdownTimeout,
        log: config.log
    });

    this.api = new Api();
    this.api.clusterWorker = this._clusterWorker;
    this.api.init(config, function (err) {
        self.log = self.api.log;

        for (var idx in self._plugins) {
            self.log.debug('Registering plugin');
            self._plugins[idx][0].register(self.api, self._plugins[idx][1]);
        }

        if (err) {
            self.log.fatal(err, 'Error initializing Flora');
            if (callback) callback(err);
            return;
        }

        if (config.staticPath) {
            self._staticHandler = serveStatic(config.staticPath);
        }

        if (!config.port) {
            self.log.warn('No port in configuration, not starting HTTP server');
            if (callback) callback(null);
            return;
        }

        self._httpServer = http.createServer(self._handleRequest.bind(self));

        self._clusterWorker.on('close', function () {
            self.close();
        });

        self._clusterWorker.attach(self._httpServer);

        self._httpServer.listen(config.port, function onListen() {
            self._clusterWorker.ready();
            self.log.info('Flora server running on port %d', config.port);
            if (callback) callback(null);
        });
    });
};

/**
 * Gracefully shutdown the server.
 *
 * @param {Function=} callback
 */
Server.prototype.close = function (callback) {
    var self = this;

    callback = callback || function () {};

    if (!this.api) return callback(new Error('Not running'));

    if (this._httpServer) {
        this.log.debug('Closing server');
        this._httpServer.close(function (err) {
            self.api.close(function () {
                // Callback will get the error from httpServer#close,
                // regardless what Api#close returns.
                callback(err);
            });
        });
    } else {
        this.api.close(callback);
    }
};

/**
 * Register a plugin.
 *
 * The plugin has to be an object with a "register" function property, which is called with
 * parameters (api, options).
 *
 * @param {Object} plugin
 * @param {Object} options
 */
Server.prototype.register = function (plugin, options) {
    this._plugins.push([plugin, options]);
    if (this.api) {
        this.api.register(plugin, options);
    }
};

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
Server.prototype._handleRequest = function (httpRequest, httpResponse) {
    var self = this;
    var floraRequest = httpToFloraRequest(httpRequest);

    if (!floraRequest) {
        if (this._staticHandler) {
            return this._staticHandler(httpRequest, httpResponse, function () {
                self._sendError(new NotFoundError('Not Found'), httpRequest, httpResponse);
            });
        }
        return this._sendError(new NotFoundError('Not Found'), httpRequest, httpResponse);
    }

    if (!this.api.getResource(floraRequest.resource) && this._staticHandler) {
        return this._staticHandler(httpRequest, httpResponse, function () {
            self._sendError(new NotFoundError('Not Found'), httpRequest, httpResponse);
        });
    }

    this.api.execute(floraRequest, function onFloraResponse(err, response) {
        if (err) {
            err.response = response;
            return self._sendError(err, httpRequest, httpResponse);
        }
        self._sendResponse(response, httpRequest, httpResponse);
    });
};

/**
 * @param {FloraError} err
 * @param {http.Request} httpRequest
 * @param {http.Response} httpResponse
 * @private
 */
Server.prototype._sendError = function (err, httpRequest, httpResponse) {
    var response = err.response || new Response();
    response.meta.statusCode = err.httpStatusCode || new errors.FloraError().httpStatusCode;
    response.error = errors.format(err, {exposeErrors: this.api.config.exposeErrors});

    this._sendResponse(response, httpRequest, httpResponse);
};

/**
 * @param {Object} response
 * @param {http.Request} httpRequest
 * @param {http.Response} httpResponse
 * @private
 */
Server.prototype._sendResponse = function (response, httpRequest, httpResponse) {
    var headers = response.meta.headers;
    var stream = httpResponse;
    var acceptEncoding = httpRequest.headers['accept-encoding'] || '';

    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json; charset=utf-8';

    if (acceptEncoding.match(/\bdeflate\b/)) {
        headers['Content-Encoding'] = 'deflate';
        stream = zlib.createDeflate();
        stream.pipe(httpResponse);
    } else if (acceptEncoding.match(/\bgzip\b/)) {
        headers['Content-Encoding'] = 'gzip';
        stream = zlib.createGzip();
        stream.pipe(httpResponse);
    }

    try {
        var json = null;

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
            var hrtime = process.hrtime(httpRequest.flora.startTime);
            headers['X-Duration'] = Math.round((hrtime[0] * 1000 + hrtime[1] / 1000000) * 1000) / 1000;
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
};

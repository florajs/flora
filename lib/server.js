'use strict';

var domain = require('domain');
var http = require('http');
var url = require('url');
var zlib = require('zlib');
var serveStatic = require('serve-static');
var ClusterWorker = require('flora-cluster').Worker;
var Api = require('./api');
var Request = require('./request');
var errors = require('flora-errors');
var NotFoundError = errors.NotFoundError;

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
        log: self.log
    });

    this.api = new Api();
    this.api.clusterWorker = this._clusterWorker;
    this.api.init(config, function (err) {
        self.log = self.api.log;

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

        self._httpServer = http.createServer(function onRequest(httpRequest, httpResponse) {
            var requestDomain = domain.create();
            requestDomain.add(httpRequest);
            requestDomain.add(httpResponse);

            requestDomain.on('error', function onRequestError(reqErr) {
                self.log.error(reqErr, 'Error processing "' + httpRequest.method + ' ' + httpRequest.url + '"');

                try {
                    self._clusterWorker.shutdown();
                    self._sendError(reqErr, httpRequest, httpResponse);
                } catch (e) {
                    self.log.error(e, 'Error sending 500');
                }
            });

            requestDomain.run(function () {
                self._handleRequest(httpRequest, httpResponse);
            });
        });

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

    var parsedUrl = url.parse(httpRequest.url, true);
    var matches = parsedUrl.pathname.match(/^\/(.+?)\/(.*?)(?:\.([a-z]+))?$/);

    if (!matches) {
        if (this._staticHandler) {
            return this._staticHandler(httpRequest, httpResponse, function () {
                self._sendError(new NotFoundError('Not Found'), httpRequest, httpResponse);
            });
        }
        return this._sendError(new NotFoundError('Not Found'), httpRequest, httpResponse);
    }

    var resource = matches[1];
    if (!this.api.getResource(resource) && this._staticHandler) {
        return this._staticHandler(httpRequest, httpResponse, function () {
            self._sendError(new NotFoundError('Not Found'), httpRequest, httpResponse);
        });
    }

    var opts = {
        resource: resource,
        _status: httpRequest.flora.status,
        _httpRequest: httpRequest
    };

    if (matches[2]) opts.id = matches[2];
    if (matches[3]) opts.format = matches[3];
    if (parsedUrl.query.action) opts.action = parsedUrl.query.action;

    for (var key in parsedUrl.query) {
        if (!opts.hasOwnProperty(key)) {
            opts[key] = parsedUrl.query[key];
        }
    }

    this.api.execute(new Request(opts), function onFloraResponse(err, response) {
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
    var response = err.response || {meta: {}};
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
    var header = {
        'Content-Type': 'application/json; charset=utf-8'
    };

    var stream = httpResponse;

    var acceptEncoding = httpRequest.headers['accept-encoding'];
    if (!acceptEncoding) acceptEncoding = '';

    if (acceptEncoding.match(/\bdeflate\b/)) {
        header['Content-Encoding'] = 'deflate';
        stream = zlib.createDeflate();
        stream.pipe(httpResponse);
    } else if (acceptEncoding.match(/\bgzip\b/)) {
        header['Content-Encoding'] = 'gzip';
        stream = zlib.createGzip();
        stream.pipe(httpResponse);
    }

    try {
        httpResponse.writeHead(response.meta.statusCode || 200, header);
        stream.end(JSON.stringify({
            meta: response.meta,
            error: response.error,
            data: response.data
        }));
    } catch (e) {
        this.log.warn(e, 'Error while sending response');
    }
};

'use strict';

var Status = require('flora-cluster').Status;
var Profiler = require('./profiler');

/**
 * Create new request
 *
 * @constructor
 * @param {Object} options          - Request configuration
 * @param {string} options.resource - Requested resource
 * @param {string=} options.action  - Resource action
 * @param {string=} options.format  - Response format
 */
module.exports = function (options) {
    var self = this;
    var readable = function (property, value) {
        Object.defineProperty(self, property, {
            value: value,
            configurable: false,
            enumerable: false
        });
    };

    options = options || {}; // TODO: remove?

    /**
     * Requested resource
     *
     * @name Request#resource
     * @type {string}
     * @readonly
     */
    this.resource = options.resource;

    /**
     * Resource action to execute
     *
     * @type {string}
     * @name Request#action
     * @default json
     * @readonly
     */
    this.action = options.action || 'retrieve';

    /**
     * Response format
     *
     * @type {string}
     * @name Request#format
     * @default json
     * @readonly
     */
    this.format = options.format || 'json';

    /**
     * Status helper object
     *
     * @type {Status}
     * @name Request#_status
     * @readonly
     */
    readable('_status', options._status || new Status());

    /**
     * Profiling helper object
     *
     * @type {Profiler}
     * @name Request#_profiler
     * @readonly
     */
    readable('_profiler', new Profiler('request'));

    /**
     * HTTP-Request object (if available)
     *
     * @type {http.IncomingMessage}
     * @name Request#_httpRequest
     * @readonly
     */
    readable('_httpRequest', options._httpRequest);
};

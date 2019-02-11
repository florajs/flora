'use strict';

const has = require('has');
const { Status } = require('flora-cluster');

const Profiler = require('./profiler');

class Request {
    /**
     * Request object.
     *
     * @param {Object} options - Request configuration
     * @param {string} options.resource - Requested resource
     * @param {string} [options.action] - Resource action
     * @param {string} [options.format] - Response format
     */
    constructor(options) {
        const readable = (property, value) => {
            Object.defineProperty(this, property, {
                value,
                configurable: false,
                enumerable: false
            });
        };

        const writable = (property, value) => {
            Object.defineProperty(this, property, {
                value,
                configurable: true,
                enumerable: false,
                writable: true
            });
        };

        options = options || {};

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
         * @default retrieve
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
         * Payload data
         *
         * @type {Status}
         * @name Request#_status
         * @readonly
         */
        readable('data', options.data);

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

        // inject startTime from "onRequest" if available:
        if (options._httpRequest && options._httpRequest.flora && options._httpRequest.flora.startTime) {
            this._profiler._startTime = options._httpRequest.flora.startTime;
        }

        /**
         * Authorization information
         *
         * @name Request#_auth
         * @readonly
         */
        writable('_auth', null);

        /**
         * HTTP request object (if available)
         *
         * @type {http.IncomingMessage}
         * @name Request#_httpRequest
         * @readonly
         */
        readable('_httpRequest', options._httpRequest);

        // copy custom parameters
        Object.keys(options).forEach(key => {
            if (!has(this, key)) this[key] = options[key];
        });
    }
}

module.exports = Request;

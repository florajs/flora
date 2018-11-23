'use strict';

class Response {
    /**
     * Response object.
     *
     * @constructor
     * @param {Request} request - The request object associated with this response
     */
    constructor(request) {
        this.request = request;

        /**
         * Response meta information
         *
         * @type {Object}
         * @name Response#meta
         */
        this.meta = { statusCode: 200 };
        Object.defineProperty(this.meta, 'headers', { value: {}, writable: true });

        /**
         * Error info (null on success)
         *
         * @type {Object}
         * @name Response#error
         */
        this.error = null;

        /**
         * Response data
         *
         * @type {(Object|Array.<Object>)}
         * @name Response#data
         */
        this.data = null;

        /**
         * Pagination information
         *
         * @type {(null|Object)}
         * @name Response#cursor
         */
        this.cursor = null;
    }

    /**
     * Set a meta header.
     *
     * @param {string} key - Header name
     * @param {string} value - Header value string
     */
    header(key, value) {
        const _key = key; // TODO: key.toLowerCase();
        this.meta.headers[_key] = (value === undefined ? '' : value);
        return this;
    }

    /**
     * Sets the status code.
     *
     * @param {number} code - HTTP status code
     */
    status(code) {
        this.meta.statusCode = code;
        return this;
    }

    /**
     * Sets the response content type.
     *
     * @param {string} type - MIME type of the response data
     */
    type(type) {
        this.header('Content-Type', type);
        return this;
    }
}

module.exports = Response;

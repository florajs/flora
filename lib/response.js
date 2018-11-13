'use strict';

class Response {
    /**
     * @constructor
     * @param {Request} request
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
     * @param {string} key
     * @param {string} value
     */
    header(key, value) {
        const _key = key; // TODO: key.toLowerCase();
        this.meta.headers[_key] = (value === undefined ? '' : value);
        return this;
    }
}

module.exports = Response;

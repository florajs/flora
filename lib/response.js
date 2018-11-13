'use strict';

const asciiArtProfile = require('./ascii-art-profile');

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

        this.sent = false;
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

    /**
     * Add profiling and meta data to the response and call our callback.
     *
     * @param {(Object|Array.<Object>|Buffer|Error)} payload  - Response data
     */
    send(payload) {
        if (this.sent) throw new Error('Response#send was already called');

        this.sent = true;
        this.data = payload;

        if (payload instanceof Error) return this;

        this.request._profiler.end();
        this.meta.duration = this.request._profiler.getDuration();

        if (this.request._profile === 'raw' || this.request._profile === '1') {
            const profile = this.request._profiler.report();

            if (this.request._profile === 'raw') {
                this.meta.profile = profile;
            } else {
                this.meta.profile = asciiArtProfile(profile, this.meta.duration, 100);
            }
        }

        return this;
    }
}

module.exports = Response;

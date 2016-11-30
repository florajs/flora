'use strict';

const asciiArtProfile = require('./ascii-art-profile');

class Response {
    /**
     * @constructor
     * @param {Request} request
     * @param {Function} callback
     */
    constructor(request, callback) {
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

        /**
         * @type {Function}
         * @private
         */
        this._callback = callback || function nop() {};
        this._sent = false;
    }

    /**
     * Add profiling and meta data to the response and call our callback.
     *
     * @param {(Object|Array.<Object>|Error)} payload  - Response data
     */
    send(payload) {
        if (this._sent) return this._callback(new Error('Response#send was already called'));

        this._sent = true;

        if (payload instanceof Error) return this._callback(payload);
        this.data = payload;

        process.nextTick(() => {
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

            this._callback(null, this);
        });

        return this;
    }
}

module.exports = Response;

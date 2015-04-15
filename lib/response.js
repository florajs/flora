'use strict';

var errors = require('./errors');

/**
 * Flora response object.
 *
 * @constructor
 * @param {Request} request
 * @param {Function} callback
 */
var Response = module.exports = function (request, callback) {
    this.request = request;

    /**
     * Response meta information
     *
     * @type {Object}
     * @name Response#meta
     */
    this.meta = {
        statusCode: 200
    };

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

    /**
     * @type {Function}
     * @private
     */
    this._callback = callback || function () {};
    this._sent = false;
};

/**
 * Add profiling and meta data to the response and call our callback.
 *
 * @param {(Object|Array.<Object>|Error)} payload  - Response data
 */
Response.prototype.send = function (payload) {
    var self = this;

    if (this._sent) {
        return this._callback(new Error('Response#send was already called'));
    }
    this._sent = true;

    if (payload instanceof Error) {
        return this._callback(payload);
    } else {
        this.data = payload;
    }

    process.nextTick(function () {
        // meta.duration (milliseconds)
        self.meta.duration = self.request.timer.end() / 1000;

        self.meta.profiler = {};
        self.request.timer.times.forEach(function(v) {
            self.meta.profiler[v[0]] = v[1] / 1000;
        });

        /*
        if (self.meta.profiler) {
            var untrackedTime = self.meta.duration;
            for (var section in self.meta.profiler) {
                untrackedTime -= self.meta.profiler[section];
            }
            self.meta.profiler._untrackedTime = Math.round(untrackedTime * 1000) / 1000;
        }
        */

        self._callback(null, self);
    });

    return this;
};

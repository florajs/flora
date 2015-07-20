'use strict';

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
        self.request.timer.end();
        self.meta.duration = self.request.timer.getDuration();

        if (self.request._profile === 'raw' || self.request._profile === '1') {
            var profile = self.request.timer.report();

            if (self.request._profile === 'raw') {
                self.meta.profile = profile;
            } else {
                self.meta.profile = asciiArtProfile(profile, self.meta.duration, 100);
            }
        }

        self._callback(null, self);
    });

    return this;
};

function asciiArtProfile(profile, totalDuration, width) {
    return profile.map(function(measure) {
        var startTime = Math.round(measure.startTime * width / totalDuration);

        if (measure.duration !== null) {
            var duration = Math.round(measure.duration * width / totalDuration);

            return strRepeat('.', startTime) +
                strRepeat('#', duration) +
                strRepeat('.', width - startTime - duration) +
                ' (' + measure.name + ' - ' + measure.duration + 'ms)';
        } else {
            return strRepeat('.', startTime) +
                strRepeat('?', width - startTime) +
                ' (' + measure.name + ' - still running!)';
        }
    });
}

function strRepeat(str, count) {
    return new Array(count + 1).join(str);
}

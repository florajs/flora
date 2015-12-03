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
    this.meta = {statusCode: 200};
    Object.defineProperty(this.meta, 'headers', {value: {}, writable: true});

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

    if (this.cursor) {
        this.cursor.page = this.request.page ? parseInt(this.request.page, 10) : 1;
        if (this.request.limit) this.cursor.limit = parseInt(this.request.limit, 10);
        if (this.cursor.limit && this.cursor.totalCount) {
            this.cursor.totalPage = Math.ceil(this.cursor.totalCount / this.cursor.limit);
        }
    }

    process.nextTick(function () {
        self.request._profiler.end();
        self.meta.duration = self.request._profiler.getDuration();

        if (self.request._profile === 'raw' || self.request._profile === '1') {
            var profile = self.request._profiler.report();

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
    if (totalDuration <= 0) return ['total duration = ' + totalDuration + 'ms!? Wow ... that was fast :-)'];
    if (width < 10) width = 10;

    return profile.map(function(measure) {
        var beforeChar = '.', beforeWidth;
        var beginChar = '';
        var durationChar = '#', durationWidth;
        var endChar = '';
        var afterChar = '.', afterWidth;
        var description;

        beforeWidth = Math.round(measure.startTime * width / totalDuration);
        if (beforeWidth > width) { beforeWidth = width; beginChar = '>'; }
        if (beforeWidth < 0) { beforeWidth = 0; beginChar = '<'; }

        if (measure.duration !== null) {
            durationWidth = Math.round(measure.duration * width / totalDuration);
            if (durationWidth > width - beforeWidth) { durationWidth = width - beforeWidth; }
            if (measure.duration > totalDuration - measure.startTime) { endChar = '>'; }
            if (durationWidth < 0) { durationWidth = 1; durationChar = '!'; endChar = '<'; }
            if (durationWidth < 1) { durationWidth = 1; durationChar = '|'; }
            description = ' (' + measure.name + ' - ' + measure.duration + 'ms)';
        } else {
            durationWidth = width - beforeWidth;
            durationChar = '?';
            afterWidth = 0;
            description = ' (' + measure.name + ' - still running!)';
        }

        afterWidth = width - beforeWidth - beginChar.length - durationWidth - endChar.length;
        if (afterWidth < 0) {
            if (durationWidth + afterWidth > 0) durationWidth += afterWidth;
            else if (beforeWidth + afterWidth > 0) beforeWidth += afterWidth;

            afterWidth = 0;
        }

        return strRepeat(beforeChar, beforeWidth) +
            beginChar +
            strRepeat(durationChar, durationWidth) +
            endChar +
            strRepeat(afterChar, afterWidth) +
            description;
    });

    function strRepeat(str, count) {
        return new Array(count + 1).join(str);
    }
}

'use strict';

function strRepeat(str, count) {
    return new Array(count + 1).join(str);
}

function asciiArtProfile(profile, totalDuration, width) {
    if (totalDuration <= 0) return ['total duration = ' + totalDuration + 'ms!? Wow ... that was fast :-)'];
    if (width < 10) width = 10;

    return profile.map((measure) => {
        const beforeChar = '.';
        const afterChar = '.';
        let endChar = '';
        let beforeWidth = 0;
        let beginChar = '';
        let durationChar = '#';
        let durationWidth = 0;
        let afterWidth = 0;
        let description = '';

        beforeWidth = Math.round((measure.startTime * width) / totalDuration);
        if (beforeWidth > width) { beforeWidth = width; beginChar = '>'; }
        if (beforeWidth < 0) { beforeWidth = 0; beginChar = '<'; }

        if (measure.duration !== null) {
            durationWidth = Math.round((measure.duration * width) / totalDuration);
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
}

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

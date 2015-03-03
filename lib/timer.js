'use strict';

/**
 * @constructor
 */
var Timer = module.exports = function (name, parent) {
    this.name = name || 'unknown';
    this.times = [];
    this.startTime = hrtime();
    this.endTime = null;
    this._parent = parent;
};

/**
 * @param {string} name
 * @return {Timer}
 */
Timer.prototype.start = function (name) {
    return new Timer(name, this);
};

/**
 * @param {object} data
 * @private
 */
Timer.prototype._add = function (data) {
    this.times.push([
        data[0],
        data[1],
        data[2] - this.startTime,
        data[3] - this.startTime
    ]);
    if (this._parent) this._parent._add(data);
};

/**
 * @return {number}
 */
Timer.prototype.end = function () {
    this.endTime = hrtime();

    var duration = (this.endTime - this.startTime);
    if (this.times.length === 0) {
        // Only add our time if we do not have any sub-timers.
        // This is experimental and subject to change in the future.
        this._add([this.name, duration, this.startTime, this.endTime]);
    }
    return duration;
};

/**
 * @return {number}
 * @private
 */
function hrtime() {
    var ht = process.hrtime();
    return ht[0] * 1000000 + Math.round(ht[1] / 1000);
}

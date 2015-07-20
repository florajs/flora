'use strict';

/**
 * @constructor
 */
var Timer = module.exports = function (name) {
    this.name = name || 'unknown';
    this._startTime = process.hrtime();
    this._duration = null;
    this._children = [];
};

Timer.prototype.end = function () {
    this._duration = process.hrtime(this._startTime);
};

/**
 * @param {string} name
 * @return {Timer}
 */
Timer.prototype.child = function (name) {
    var child = new Timer(name);
    this._children.push(child);
    return child;
};
Timer.prototype.start = Timer.prototype.child; // TODO: Refactor everywhere

/**
 * @return {number} Duration in milliseconds
 */
Timer.prototype.getDuration = function () {
    return calcTime(this._duration);
};

/**
 * @param {number} startTime All times are resolved relative to this startTime
 * @return {Array}
 */
Timer.prototype.report = function (startTime) {
    startTime = startTime || calcTime(this._startTime);

    var report = [{
        name: this.name,
        startTime: calcTime(this._startTime, - startTime),
        duration: this._duration !== null ? calcTime(this._duration) : null
    }];

    this._children.forEach(function (child) {
        report = report.concat(child.report(startTime));
    });

    return report;
};

/**
 * Convert hrtime array to milliseconds, optionally add milliseconds
 * and round the result to 3 decimals.
 *
 * @param {Array} hrtime Time in process.hrtime format
 * @param {number=} add Time in milliseconds to add after conversion
 * @return {number} Rounded time in milliseconds
 * @private
 */
function calcTime(hrtime, add) {
    return Math.round(
        (hrtime[0] * 1000 + hrtime[1] / 1000000 + (add || 0))
        * 1000
    ) / 1000;
}

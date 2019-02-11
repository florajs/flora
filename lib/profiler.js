'use strict';

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
    return Math.round((hrtime[0] * 1000 + hrtime[1] / 1000000 + (add || 0)) * 1000) / 1000;
}

/**
 * Simple profiler for tracking time in requests.
 */
class Profiler {
    /**
     * Instantiate new profiler and start time.
     *
     * @param {string} [name] - Profiler name (default: "unknown")
     */
    constructor(name) {
        this.name = name || 'unknown';
        this._startTime = process.hrtime();
        this._duration = null;
        this._children = [];
    }

    /**
     * Stop time tracking.
     */
    end() {
        this._duration = process.hrtime(this._startTime);
    }

    /**
     * Create a child profiler.
     *
     * Its data is aggregated into ours.
     *
     * @param {string} [name] - Name of the child profiler
     * @returns {Profiler}
     */
    child(name) {
        const child = new Profiler(name);
        this._children.push(child);
        return child;
    }

    /**
     * Return the duration since instantiation until end().
     *
     * @returns {number} Duration in milliseconds
     */
    getDuration() {
        return calcTime(this._duration);
    }

    /**
     * Return a report object.
     *
     * @param {number} [startTime] - All times are resolved relative to this startTime
     * @return {Array.<Object>} Array of objects with profiling information.
     */
    report(startTime) {
        startTime = startTime || calcTime(this._startTime);

        let report = [
            {
                name: this.name,
                startTime: calcTime(this._startTime, -startTime),
                duration: this._duration !== null ? calcTime(this._duration) : null
            }
        ];

        this._children.forEach(child => {
            report = report.concat(child.report(startTime));
        });

        return report;
    }
}

module.exports = Profiler;

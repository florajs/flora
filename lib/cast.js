'use strict';

var moment = require('moment-timezone');

var casts = {};

casts.boolean = function (value) {
    return (value === '0' ? false : !!value);
};

casts.unixtime = function (value) {
    // For now, we leave it this way.
    // However, if the type of value is less specific than unixtime (e.g. a date
    // string like "2016-09-20"), some issue may occur when using in filters.
    var m = new Date(value);
    var t = m.getTime();
    if (isNaN(t)) return null;
    return Math.round(t / 1000);
};

casts.datetime = function (value, options) {
    try {
        var m;
        if (!options || !options.storedType) {
            // No storedType, assume something "new Date()" can understand.
            m = moment(new Date(value));
        } else {
            if (options.storedType.type === 'unixtime') {
                // Convert from unixtime to datetime
                m = moment(new Date(parseInt(value, 10) * 1000));
            } else if (options.storedType.options && options.storedType.options.tz) {
                // Convert from string/int to DateTime with timezone
                var storedTz = options.storedType.options.tz;
                if (moment.tz.zone(storedTz)) {
                    m = moment.tz(value, storedTz);
                } else {
                    // TODO: log: invalid timezone
                    m = moment(new Date(value));
                }
            } else {
                // Assume something that `new Date()` can understand.
                m = moment(new Date(value));
            }
        }
        if (!m.isValid()) throw new Error('Invalid date: ' + value);
        return m.toISOString();
    } catch (e) {
        // TODO: log: cannot parse date: value
        return null;
    }
};

casts.date = function (value, options) {
    var result = casts.datetime(value, options);
    return (result ? result.substring(0, 10) : null);
};

casts.time = function (value, options) {
    var result = casts.datetime(value, options);
    return (result ? result.substring(11) : null);
};

casts.float = function (value) {
    return parseFloat(value);
};

casts.int = function (value) {
    return parseInt(value, 10);
};

casts.raw = function (value) {
    return value;
};

casts.string = function (value) {
    return '' + value;
};

/**
 * Simple type casting
 *
 * @param value
 * @param {object} type {type: ...}
 * @return {*} cast value
 */
module.exports = function cast(value, opts) {
    opts = opts || {};

    if (opts.delimiter && typeof value === 'string') {
        if (value === '') return [];
        return value.split(opts.delimiter).map(function (part) {
            return cast(part, {type: opts.type});
        });
    }

    if (opts.multiValued) {
        if (!Array.isArray(value)) {
            if (value === null) return [];
            return [cast(value, {type: opts.type})];
        }
        return value.map(function (part) {
            return cast(part, {type: opts.type});
        });
    }

    if (value === null) return value;
    if (casts[opts.type]) return (casts[opts.type])(value, opts);

    return value;
};

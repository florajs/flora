'use strict';

const moment = require('moment-timezone');

const casts = {};

casts.boolean = value => (value === '0' ? false : !!value);

casts.unixtime = (value) => {
    // For now, we leave it this way.
    // However, if the type of value is less specific than unixtime (e.g. a date
    // string like "2016-09-20"), some issue may occur when using in filters.
    const m = new Date(value);
    const t = m.getTime();
    if (isNaN(t)) return null;
    return Math.round(t / 1000);
};

casts.datetime = (value, options) => {
    try {
        let m;
        if (!options || !options.storedType) {
            // No storedType, assume ISO 8601 (strict)
            m = moment(value, moment.ISO_8601, true);
        } else if (options.storedType.type === 'unixtime') {
            // Convert from unixtime to datetime
            m = moment(parseInt(value, 10), 'X');
        } else if (options.storedType.options && options.storedType.options.tz) {
            // Convert from string/int to DateTime with timezone
            const storedTz = options.storedType.options.tz;
            if (moment.tz.zone(storedTz)) {
                m = moment.tz(value, moment.ISO_8601, true, storedTz);
            } else {
                // TODO: log: invalid timezone
                m = moment(value, moment.ISO_8601, true);
            }
        } else {
            // Assume ISO 8601 (strict)
            m = moment(value, moment.ISO_8601, true);
        }
        if (!m.isValid()) throw new Error(`Invalid date: ${value}`);
        return m.toISOString();
    } catch (e) {
        // TODO: log(`cannot parse date: "${value}": ${e.message}`);
        return null;
    }
};

casts.date = (value, options) => {
    if (options && options.storedType &&
        options.storedType.type === 'date' && options.storedType.options &&
        options.storedType.options.tz) {
        // Pass through when converting from "date" to "date"
        // to avoid confusion with timezones.
        return value;
    }
    const result = casts.datetime(value, options);
    return (result ? result.substring(0, 10) : null);
};

casts.time = (value, options) => {
    const result = casts.datetime(value, options);
    return (result ? result.substring(11) : null);
};

casts.float = value => parseFloat(value);

casts.int = value => parseInt(value, 10);

casts.raw = value => value;

casts.string = value => ('' + value);

casts.object = (value, options) => {
    if (!options || !options.storedType) {
        // TODO: log: no storedType for object
        return null;
    }

    if (options.storedType.type === 'object') return value;

    if (options.storedType.type === 'json') {
        let obj;
        try {
            obj = JSON.parse(value);
        } catch (e) {
            // TODO: log: cannot parse object: value
            return null;
        }
        return obj;
    }

    // TODO: log: invalid storedType for object
    return null;
};

casts.json = (value, options) => {
    if (options && options.storedType && options.storedType.type === 'json') return value;

    try {
        return JSON.stringify(value);
    } catch (e) {
        // TODO: log: cannot stringify value
        return null;
    }
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
        return value.split(opts.delimiter).map(part =>
            cast(part, { type: opts.type }));
    }

    if (opts.multiValued) {
        if (!Array.isArray(value)) {
            if (value === null) return [];
            return [cast(value, { type: opts.type })];
        }
        return value.map(part => cast(part, { type: opts.type }));
    }

    if (value === null) return value;
    if (casts[opts.type]) return (casts[opts.type])(value, opts);

    return value;
};

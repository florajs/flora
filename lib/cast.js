'use strict';

const has = require('has');
const moment = require('moment-timezone');

const casts = {};

casts.boolean = value => (value === '0' ? false : !!value);

casts.unixtime = (value) => {
    // For now, we leave it this way.
    // However, if the type of value is less specific than unixtime (e.g. a date
    // string like "2016-09-20"), some issue may occur when using in filters.
    const m = new Date(value);
    const t = m.getTime();
    if (Number.isNaN(Number(t))) return null;
    return Math.round(t / 1000);
};

casts.datetime = (value, options, api) => {
    try {
        let m;
        if (!options || !options.storedType) {
            // No storedType, assume ISO 8601 (strict)
            m = moment(value, moment.ISO_8601, true);
        } else if (options.storedType.type === 'unixtime') {
            // Convert from unixtime to datetime
            m = moment(parseInt(value, 10), 'X');
        } else if (options.storedType.options && options.storedType.options.timezone) {
            // Convert from string/int to DateTime with timezone
            const storedTimezone = options.storedType.options.timezone;
            if (moment.tz.zone(storedTimezone)) {
                m = moment.tz(value, moment.ISO_8601, true, storedTimezone);
            } else {
                api.log.warn(`Invalid timezone: "${storedTimezone}"`);
                m = moment(value, moment.ISO_8601, true);
            }
        } else {
            // Assume ISO 8601 (strict)
            m = moment(value, moment.ISO_8601, true);
        }
        if (!m.isValid()) throw new Error('Invalid date format');

        if (api && api.config && api.config.timezone) {
            m.tz(api.config.timezone);
            return m.isUtc() ? m.toISOString() : m.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
        }
        return m.toISOString();
    } catch (e) {
        //api.log.warn(`cannot parse date: "${value}": ${e.message}`);
        return null;
    }
};

casts.date = (value, options, api) => {
    if (options && options.storedType &&
        options.storedType.type === 'date' && options.storedType.options &&
        options.storedType.options.timezone) {
        // Pass through when converting from "date" to "date"
        // to avoid confusion with timezones.
        return value;
    }
    const result = casts.datetime(value, options, api);
    return (result ? result.substring(0, 10) : null);
};

casts.time = (value, options, api) => {
    const result = casts.datetime(value, options, api);
    return (result ? result.substring(11) : null);
};

casts.float = value => parseFloat(value);

casts.int = value => parseInt(value, 10);

casts.raw = value => value;

casts.string = value => ('' + value);

casts.object = (value, options, api) => {
    if (!options || !options.storedType) {
        api.log.warn('no storedType for object');
        return null;
    }

    if (options.storedType.type === 'object') return value;

    if (options.storedType.type === 'json') {
        let obj;
        try {
            obj = JSON.parse(value);
        } catch (e) {
            api.log.warn(`cannot parse JSON: '${value}`);
            return null;
        }
        return obj;
    }

    api.log.warn(`invalid storedType "${options.storedType.type}" for object`);
    return null;
};

casts.json = (value, options, api) => {
    if (options && options.storedType && options.storedType.type === 'json') return value;

    try {
        return JSON.stringify(value);
    } catch (e) {
        api.log.warn('cannot stringify object to JSON: ' + e);
        return null;
    }
};

class Cast {
    constructor(api) {
        this.api = api;
    }

    /**
     * @param value
     * @param {object} type {type: ...}
     * @return {*} cast value
     */
    cast(value, opts) {
        opts = opts || {};

        if (opts.delimiter && typeof value === 'string') {
            if (value === '') return [];
            return value.split(opts.delimiter).map(part =>
                this.cast(part, { type: opts.type }));
        }

        if (opts.multiValued) {
            if (!Array.isArray(value)) {
                if (value === null) return [];
                return [this.cast(value, { type: opts.type })];
            }
            return value.map(part => this.cast(part, { type: opts.type }));
        }

        if (value === null) return value;
        if (has(casts, opts.type)) return (casts[opts.type])(value, opts, this.api);

        return value;
    }
}

module.exports = Cast;

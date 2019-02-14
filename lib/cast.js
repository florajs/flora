'use strict';

const has = require('has');
const moment = require('moment-timezone');
const { DataError, ImplementationError } = require('flora-errors');

const casts = {};

casts.boolean = value => (value === '0' ? false : !!value);

casts.unixtime = value => {
    // For now, we leave it this way.
    // However, if the type of value is less specific than unixtime (e.g. a date
    // string like "2016-09-20"), some issue may occur when using in filters.
    const m = new Date(value);
    const t = m.getTime();
    if (Number.isNaN(Number(t))) return null;
    return Math.round(t / 1000);
};

function parseDatetime(value, options, api) {
    // Handle zero dates
    if (value === '0000-00-00' || value === '0000-00-00 00:00:00') return null;

    const apiTz = api && api.config && api.config.timezone ? api.config.timezone : 'UTC';

    const storedTz =
        options && options.storedType && options.storedType.options && options.storedType.options.timezone
            ? options.storedType.options.timezone
            : apiTz;

    if (!moment.tz.zone(storedTz)) throw new ImplementationError(`Invalid timezone: "${storedTz}"`);

    let m;
    if (options && options.storedType && options.storedType.type === 'unixtime') {
        m = moment(parseInt(value, 10), 'X');
    } else {
        m = moment.tz(value, moment.ISO_8601, true, storedTz);
    }

    if (!m.isValid()) throw new DataError('Invalid date format');

    return m;
}

casts.datetime = (value, options, api) => {
    const apiTz = api && api.config && api.config.timezone ? api.config.timezone : 'UTC';

    try {
        const m = parseDatetime(value, options, api);
        if (apiTz === 'UTC') return m.toISOString();
        m.tz(apiTz);
        return m.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    } catch (e) {
        // api.log.warn(`cannot parse date: "${value}": ${e.message}`);
        return null;
    }
};

casts.date = (value, options, api) => {
    try {
        const m = parseDatetime(value, options, api);
        return m.format('YYYY-MM-DD');
    } catch (e) {
        // api.log.warn(`cannot parse date: "${value}": ${e.message}`);
        return null;
    }
};

casts.time = (value, options, api) => {
    const result = casts.datetime(value, options, api);
    return result ? result.substring(11) : null;
};

casts.float = value => parseFloat(value);

casts.int = value => parseInt(value, 10);

casts.raw = value => value;

casts.string = value => '' + value;

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
            return value.split(opts.delimiter).map(part => this.cast(part, { type: opts.type }));
        }

        if (opts.multiValued) {
            if (!Array.isArray(value)) {
                if (value === null) return [];
                return [this.cast(value, { type: opts.type })];
            }
            return value.map(part => this.cast(part, { type: opts.type }));
        }

        if (value === null) return value;
        if (has(casts, opts.type)) return casts[opts.type](value, opts, this.api);

        return value;
    }
}

module.exports = Cast;

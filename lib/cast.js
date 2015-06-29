'use strict';

/**
 * Simple type casting
 *
 * @param value
 * @param {string} type
 * @return {*} cast value
 */
module.exports = function cast(value, opts) {
    opts = opts || {};

    if (opts.delimiter && typeof value === 'string') {
        var delimiter = opts.delimiter;
        delete(opts.delimiter);
        var values = value.split(delimiter).map(function (part) {
            return cast(part, opts);
        });
        opts.delimiter = delimiter;
        return values;
    }

    if (value === null) return value;
    if (!opts.type) return value;
    if (opts.type === 'raw') return value;
    if (opts.type === 'string') return '' + value;
    if (opts.type === 'int') return parseInt(value, 10);
    if (opts.type === 'float') return parseFloat(value);
    if (opts.type === 'boolean') return (value === '0' ? false : !!value);

    try {
        if (opts.type === 'datetime') return (new Date(value)).toISOString();
        if (opts.type === 'date') return (new Date(value)).toISOString().substring(0, 10);
        if (opts.type === 'time') return (new Date(value)).toISOString().substring(11);
    } catch (e) {
        return null;
    }

    return value;
};

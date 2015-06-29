'use strict';

var casts = {};

casts.boolean = function (value) {
    return (value === '0' ? false : !!value);
};

casts.date = function (value) {
    try {
        return (new Date(value)).toISOString().substring(0, 10);
    } catch (e) { return null; }
};

casts.datetime = function (value) {
    try {
        return (new Date(value)).toISOString();
    } catch (e) { return null; }
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

casts.time = function (value) {
    try {
        return (new Date(value)).toISOString().substring(11);
    } catch (e) { return null; }
};

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

    if (casts[opts.type]) return (casts[opts.type])(value);

    return value;
};

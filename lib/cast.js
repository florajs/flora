'use strict';

/**
 * Simple type casting
 *
 * @param value
 * @param {string} type
 * @return cast value
 */
module.exports = function cast(value, type) {
    if (value === null) return value;
    if (type === 'string') return '' + value;
    if (type === 'int') return parseInt(value, 10);
    if (type === 'float') return parseFloat(value);
    if (type === 'boolean') return (value === '0' ? false : !!value);
    if (type === 'date') return (new Date(value)).toISOString();
    if (type === 'datetime') return (new Date(value)).toISOString();
    if (type === 'time') return (new Date(value)).toISOString();
    if (type === 'raw') return value;

    return value;
};

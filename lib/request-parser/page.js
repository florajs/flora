'use strict';

/**
 * Parse "page" options.
 *
 * @param {(number|string|undefined)} input
 * @return {number}
 */
module.exports = function pageParser(input) {
    // default: 1
    if (typeof input === 'undefined') return 1;

    // convert strings
    if (typeof input === 'string') {
        if (! isFinite(input)) {
            throw new Error('page must be a number');
        }
        input = parseInt(input, 10);
    }

    // check type
    if (typeof input !== 'number') {
        throw new Error('page must be a number');
    }

    // check range
    if (input < 1) {
        throw new RangeError('page must be greater than 0');
    }

    return input;
};

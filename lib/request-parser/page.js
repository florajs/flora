'use strict';

var RequestError = require('flora-errors').RequestError;

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
            throw new RequestError('page must be a number');
        }
        input = parseInt(input, 10);
    }

    // check type
    if (typeof input !== 'number') {
        throw new RequestError('page must be a number');
    }

    // check range
    if (input < 1) {
        throw new RequestError('page must be greater than 0');
    }

    return input;
};

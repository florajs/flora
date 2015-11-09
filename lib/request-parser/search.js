'use strict';

var RequestError = require('flora-errors').RequestError;

/**
 * Parse "search" options.
 *
 * @param {(number|string|undefined)} input
 * @return {(string|undefined)}
 */
module.exports = function searchParser(input) {
    if (typeof input === 'undefined') return undefined;

    if (typeof input === 'number') input = '' + input;
    if (typeof input !== 'string') throw new RequestError('search must be a string');

    return input;
};

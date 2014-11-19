'use strict';

/**
 * Parse "search" options.
 *
 * @param {(number|string|undefined)} input
 * @return {(string|undefined)}
 */
module.exports = function searchParser(input) {
    if (typeof input === 'undefined') return undefined;

    if (typeof input === 'number') input = '' + input;
    if (typeof input !== 'string') throw new Error('search must be a string');

    return input;
};

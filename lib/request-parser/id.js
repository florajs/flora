'use strict';

var RequestError = require('flora-errors').RequestError;

/**
 * Parse "id".
 *
 * @param {(string|number)} input
 * @return {string}
 */
module.exports = function idParser(input) {
    if (typeof input !== 'string' &&
        typeof input !== 'number') {
        throw new RequestError('id only allows string or number');
    }
    return '' + input;
};

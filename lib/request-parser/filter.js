'use strict';

var ql = require('flora-ql');
var RequestError = require('flora-errors').RequestError;

var operators = {
    '!=': 'notEqual',
    '<=': 'lessOrEqual',
    '>=': 'greaterOrEqual',
    '=': 'equal',
    '<': 'less',
    '>': 'greater'
};

ql.setConfig('api');

/**
 * Parse "filter" options.
 *
 * @param {string} input
 * @return {Object}
 */
module.exports = function filterParser(input) {
    var result, i, j;

    if (typeof input !== 'string') {
        throw new RequestError('filter must be a string');
    }

    result = ql.parse(input);

    for (i = 0; i < result.length; i++) {
        for (j = 0; j < result[i].length; j++) {
            result[i][j].operator = operators[result[i][j].operator];
        }
    }

    return result;
};

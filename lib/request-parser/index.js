'use strict';

var RequestError = require('flora-errors').RequestError;

module.exports = parseRequest;

var parsers = {
    'id': require('./id'),
    'aggregate': require('./aggregate'),
    'filter': require('./filter'),
    'limit': require('./limit'),
    'order': require('./order'),
    'page': require('./page'),
    'search': require('./search'),
    'select': require('./select')
};

/**
 * Parse a request object.
 *
 * @param {Object} input
 * @return {Object}
 * @public
 */
function parseRequest(input) {
    var output = {};

    if (typeof input !== 'object') {
        throw new RequestError('Cannot parse request: must be an object');
    }

    for (var key in input) {
        try {
            if (parsers.hasOwnProperty(key)) {
                output[key] = parsers[key](input[key]);
            } else {
                output[key] = input[key];
            }
        } catch (e) {
            var err = new RequestError('Cannot parse ' + key + ': ' + e.message);
            err.stack = e.stack;
            throw err;
        }
    }

    return output;
}

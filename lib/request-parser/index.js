'use strict';

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
        throw new Error('request must be an object');
    }

    for (var key in input) {
        if (parsers.hasOwnProperty(key)) {
            output[key] = parsers[key](input[key]);
        } else {
            output[key] = input[key];
        }
    }

    return output;
}

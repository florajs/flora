'use strict';

var validOrders = ['asc', 'desc', 'topflop'];

/**
 * Parse "order" options.
 *
 * @param {string} input
 * @return {(Array.<Object>|Object)}
 */
module.exports = function orderParser(input) {
    var output, components, i, s;

    output = [];

    if (typeof input !== 'string') {
        throw new Error('order must be a string');
    }
    components = input.split(',');
    if (components.indexOf('') !== -1) {
        throw new Error('order cannot be empty');
    }

    // special case: ":random"
    if (input === ':random') {
        return {
            attributePath: null,
            direction: 'random'
        };
    }

    for (i in components) {
        s = components[i].split(':');
        if (s.length < 2) {
            throw new Error('Invalid order parameter (missing direction): ' + components[i]);
        }
        if (s.length > 2) {
            throw new Error('Invalid order parameter: ' + components[i]);
        }
        if (validOrders.indexOf(s[1]) === -1) {
            throw new Error('Invalid order direction: ' + components[i]);
        }

        output.push({
            attribute: s[0].split('.'),
            direction: s[1]
        });
    }

    return output;
};

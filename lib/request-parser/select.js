'use strict';

var RequestError = require('flora-errors').RequestError;
var config = require('flora-ql/config');
var tokenizer = require('flora-ql/tokenizer');
var clearSquare = require('flora-ql/clearSquare');

var requestParser = require('./index');

var cfg = config({
    or: ',',
    and: ' AND ', // not used
    lookDelimiter: ',',
    operators: ['='],
    roundBracket: ['(', ')'],
    squareBracket: ['[', ']'],
    validateStrings: false,
    validateStatements: false,
    validateConnectives: false
});

/**
 * Parse "select" options.
 *
 * @param {string} input
 * @return {Object}
 */
module.exports = function selectParser(input) {
    var str, values, k, lk, s, res, tmp, tmp2, scope;

    if (typeof input !== 'string') {
        throw new RequestError('select must be a string');
    }

    // Tokenize
    str = tokenizer(cfg)(input);

    if (Object.keys(str[1]).length < 1) {
        throw new RequestError('select cannot be empty');
    }

    // Merge round brackets, reference values to statements
    values = {};
    while ((s = /(e[0-9]+)\((e[0-9]+)\)/g.exec(str[0])) !== null) {
        if (!(s[1] in values)) values[s[1]] = [];
        values[s[1]].push(str[1][s[2]]);

        k = s[1];
        k = k[0] + k.substr(1, k.length).replace(/e/g, '_');
        str[0] = str[0].replace(s[0], k);
    }

    // Merge adjacent statement expressions
    while ((s = /(e[0-9_]+)(e[0-9]+)/.exec(str[0])) !== null) {
        str[1][s[2]].attribute = str[1][s[2]].attribute.substr(1, str[1][s[2]].attribute.length);
        //str[1][s[1]] = str[1][s[1]].merge(str[1][s[2]]);
        str[0] = str[0].replace(s[0], s[1] + '_' + s[2].replace('e', ''));
    }

    // Remove square brackets
    str = clearSquare(cfg)(str);

    // Remove last round brackets
    str[0] = str[0].replace(/[\(\)]/g, '');

    // Build tree, the ugly way by statement identifier
    tmp = str[0].split(',');
    res = {};
    for (var i = 0, l = tmp.length; i < l; i++) {
        tmp2 = tmp[i].substr(1, tmp[i].length).split('_');

        scope = res;
        for (var j = 0, lj = tmp2.length; j < lj; j++) {

            var key = str[1]['e' + tmp2[j]].attribute;
            key = key.split('.');

            for (k = 0, lk = key.length; k < lk; k++) {
                if (!key[k]) {
                    if (j > 0) continue;
                    throw new RequestError('Invalid attribute');
                }
                if (!(key[k] in scope)) {
                    if (j === lj - 1 && k === lk - 1) {
                        scope[key[k]] = {};
                    } else {
                        scope[key[k]] = {select: {}};
                    }
                }
                if (k === lk - 1 && values['e' + tmp2[j]]) {
                    for (var z = 0, lz = values['e' + tmp2[j]].length; z < lz; z++) {
                        if (values['e' + tmp2[j]][z].operator !== '=') {
                            throw new RequestError('Invalid operator: ' + values['e' + tmp2[j]][z].operator);
                        }
                        // this is ugly:
                        var v = {};
                        v[values['e' + tmp2[j]][z].attribute] = values['e' + tmp2[j]][z].value;
                        scope[key[k]][values['e' + tmp2[j]][z].attribute] =
                            requestParser(v)[values['e' + tmp2[j]][z].attribute];
                    }
                }
                scope = scope[key[k]].select;
            }
        }
    }

    return res;
};

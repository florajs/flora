'use strict';

const url = require('url');

const { RequestError } = require('flora-errors');

const Request = require('./request');

/**
 * Map HTTP request into a Flora request
 *
 * @param httpRequest
 * @return {Object|null}
 */
function httpToFloraRequest(httpRequest) {
    const parsedUrl = url.parse(httpRequest.url, true);
    const matches = parsedUrl.pathname.match(/^\/(.+)\/([^/.]*)(?:\.([a-z]+))?$/);
    if (!matches) return null;

    const opts = {
        resource: matches[1],
        _status: httpRequest.flora.status,
        _httpRequest: httpRequest
    };

    if (matches[2]) opts.id = matches[2];
    if (matches[3]) opts.format = matches[3];

    Object.keys(parsedUrl.query).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(opts, key)) {
            if (Array.isArray(parsedUrl.query[key])) {
                throw new RequestError('Duplicate parameter "' + key + '" in URL');
            }

            opts[key] = parsedUrl.query[key];
        }
    });

    return new Request(opts);
}

module.exports = httpToFloraRequest;

'use strict';

var Request = require('./request');
var url = require('url');

/**
 * Map HTTP request into a Flora request
 *
 * @param httpRequest
 * @return {Object|null}
 */
function httpToFloraRequest(httpRequest) {
    var parsedUrl = url.parse(httpRequest.url, true);
    var matches = parsedUrl.pathname.match(/^\/(.+)\/([^/.]*)(?:\.([a-z]+))?$/);
    var opts;

    if (!matches) return null;

    opts = {
        resource: matches[1],
        _status: httpRequest.flora.status,
        _httpRequest: httpRequest
    };

    if (matches[2]) opts.id = matches[2];
    if (matches[3]) opts.format = matches[3];

    for (var key in parsedUrl.query) {
        if (!opts.hasOwnProperty(key)) {
            opts[key] = parsedUrl.query[key];
        }
    }

    return new Request(opts);
}

module.exports = httpToFloraRequest;

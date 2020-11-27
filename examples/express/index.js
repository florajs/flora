'use strict';

const errors = require('flora-errors');
const flora = require('flora');
const { URL } = require('url');

module.exports = function (api) {
    function sendResponse(response, httpRequest, httpResponse) {
        var header = { 'Content-Type': 'application/json; charset=utf-8' };
        httpResponse.writeHead(response.meta.statusCode || 200, header);
        httpResponse.end(
            JSON.stringify({
                meta: response.meta,
                error: response.error,
                data: response.data
            })
        );
    }

    function sendError(err, httpRequest, httpResponse) {
        sendResponse(
            {
                meta: { statusCode: err.httpStatusCode || errors.FloraError.httpStatusCode },
                error: errors.format(err, { exposeErrors: api.config.exposeErrors })
            },
            httpRequest,
            httpResponse
        );
    }

    return function (httpRequest, httpResponse, next) {
        var parsedUrl = new URL(httpRequest.url, true);
        const matches = parsedUrl.pathname.match(/^\/(.+)\/([^/.]*)(?:\.([a-z]+))?$/);
        if (!matches) {
            return next();
        }

        const opts = {
            resource: matches[1],
            _status: httpRequest.flora.status,
            _httpRequest: httpRequest
        };

        if (!api.getResource(opts.resource)) {
            return sendError(new errors.NotFoundError('Not Found'), httpRequest, httpResponse);
        }

        if (matches[2]) opts.id = matches[2];
        if (matches[3]) opts.format = matches[3];

        parsedUrl.searchParams.forEach((value, param) => {
            if (!Object.prototype.hasOwnProperty.call(opts, param)) {
                if (parsedUrl.searchParams.getAll(param).length > 1) {
                    return next(new errors.RequestError(`Duplicate parameter "${param}" in URL`));
                }
                opts[param] = parsedUrl.searchParams.get(param);
            }
        });

        api.execute(new flora.Request(opts), function onFloraResponse(err, response) {
            if (err) return sendError(err, httpRequest, httpResponse);
            sendResponse(response, httpRequest, httpResponse);
        });
    };
};

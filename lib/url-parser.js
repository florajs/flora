'use strict';

const url = require('url');
const querystring = require('querystring');

const { RequestError } = require('flora-errors');
const contentType = require('content-type');
const Busboy = require('@godmodelabs/busboy');

const Request = require('./request');

/**
 * Map HTTP request into a Flora request
 *
 * @param {http.IncomingRequest} httpRequest
 * @returns {Promise}
 * @private
 */
function httpToFloraRequest(httpRequest) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(httpRequest.url, true);
        const matches = parsedUrl.pathname.match(/^\/(.+)\/([^/.]*)(?:\.([a-z]+))?$/);
        if (!matches) {
            resolve(null);
            return;
        }

        /*
         * Gather GET parameters.
         */
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
                    reject(new RequestError(`Duplicate parameter "${key}" in URL`));
                    return;
                }

                opts[key] = parsedUrl.query[key];
            }
        });

        /*
         * Handle POST payload.
         */
        httpRequest.on('error', (err) => reject(new RequestError('Error reading HTTP-Request: ' + err.message)));

        if (httpRequest.method === 'POST' && !Number.isNaN(Number(httpRequest.headers['content-length']))) {
            let payload = '';
            let contentTypes;

            if (httpRequest.headers['content-type']) {
                contentTypes = contentType.parse(httpRequest.headers['content-type']);
            } else {
                reject(new RequestError('Missing required Content-Type headers'));
                return;
            }

            if (contentTypes.type === 'application/json' || contentTypes.type === 'application/x-www-form-urlencoded') {
                // POST Form Data or JSON
                httpRequest.setEncoding(contentTypes.parameters.charset || 'utf-8');
                httpRequest.on('data', (chunk) => {
                    payload += chunk;
                });

                httpRequest.on('aborted', () => {
                    reject(new RequestError('HTTP request has been aborted'));
                    return;
                });

                httpRequest.on('end', () => {
                    if (contentTypes.type === 'application/x-www-form-urlencoded') {
                        payload = querystring.parse(payload);
                        Object.keys(payload).forEach((key) => {
                            if (!Object.prototype.hasOwnProperty.call(opts, key)) {
                                if (Array.isArray(payload[key])) {
                                    reject(new RequestError(`Duplicate parameter "${key}" in Payload`));
                                    return;
                                }

                                opts[key] = payload[key];
                            }
                        });
                        if (!httpRequest.body) httpRequest.body = payload;
                    } else if (contentTypes.type === 'application/json') {
                        try {
                            opts.data = JSON.parse(payload);
                        } catch (err) {
                            reject(new RequestError('Invalid payload, must be valid JSON'));
                            return;
                        }
                        if (!httpRequest.body) httpRequest.body = opts.data;
                    }

                    resolve(new Request(opts));
                });
            } else {
                // multipart file upload or other content types (e.g. single file upload)
                const busboy = new Busboy({ headers: httpRequest.headers });
                busboy.on('error', (err) => reject(err));
                opts.data = busboy;
                resolve(new Request(opts));
                setImmediate(() => httpRequest.pipe(busboy));
            }
        } else {
            resolve(new Request(opts));
        }
    });
}

module.exports = httpToFloraRequest;

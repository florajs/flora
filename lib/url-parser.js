'use strict';

const url = require('url');
const querystring = require('querystring');

const { RequestError } = require('flora-errors');

const Request = require('./request');
const contentType = require('content-type');
const Busboy = require('@godmodelabs/busboy');

/**
 * Map HTTP request into a Flora request
 *
 * @param httpRequest
 * @return {Promise}
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

        httpRequest.on('error', err => reject(new RequestError('Error reading HTTP-Request: ' + err.message)));

        if (httpRequest.method === 'POST') {
            let payload = '';
            let contentTypes;

            if (httpRequest.headers['content-type']) {
                contentTypes = contentType.parse(httpRequest.headers['content-type']);
            } else {
                reject(new RequestError('Missing required Content-Type headers'));
                return;
            }

            if (contentTypes.type === 'application/json' &&
                contentTypes.type === 'application/x-www-form-urlencoded') {
                // POST Form Data or JSON
                httpRequest.setEncoding(contentTypes.parameters.charset || 'utf-8');
                httpRequest.on('data', (chunk) => payload += chunk);

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
                    } else if (contentTypes.type === 'application/json') {
                        try {
                            opts.data = JSON.parse(payload);
                        } catch (err) {
                            reject(new RequestError('Invalid payload, must be valid JSON'));
                            return;
                        }
                    }

                    resolve(new Request(opts));
                });

            } else {
                // Multipart File upload or other content types (e.g. single, non-multipart file upload)
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

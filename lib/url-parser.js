'use strict';

const { URL } = require('url');
const { MIMEType } = require('node:util');
const querystring = require('querystring');

const { RequestError } = require('@florajs/errors');

const Request = require('./request');

/**
 * Map HTTP request into a Flora request
 *
 * @param {http.IncomingRequest} httpRequest
 * @param {Number} [options.timeout] Timeout when reading POST data (milliseconds)
 * @returns {Promise}
 * @private
 */
function httpToFloraRequest(httpRequest, { postTimeout } = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(httpRequest.url, 'http://localhost');
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
            _auth: null,
            _status: httpRequest.flora.status,
            _httpRequest: httpRequest
        };

        if (matches[2]) opts.id = matches[2];
        if (matches[3]) opts.format = matches[3];

        parsedUrl.searchParams.forEach((value, param) => {
            if (!Object.hasOwn(opts, param)) {
                if (parsedUrl.searchParams.getAll(param).length > 1) {
                    reject(new RequestError(`Duplicate parameter "${param}" in URL`));
                    return;
                }

                opts[param] = parsedUrl.searchParams.get(param);
            }
        });

        /*
         * Handle POST payload.
         */
        httpRequest.on('error', (err) => reject(new RequestError('Error reading HTTP-Request: ' + err.message)));

        if (httpRequest.method === 'POST' && Number(httpRequest.headers['content-length']) > 0) {
            let payload = '';

            if (!httpRequest.headers['content-type']) {
                reject(new RequestError('Missing required Content-Type headers'));
                return;
            }

            let contentType;
            try {
                contentType = new MIMEType(httpRequest.headers['content-type']);
            } catch (err) {
                reject(new RequestError('Error parsing Content-Type header', { cause: err }));
                return;
            }

            if (
                contentType.essence === 'application/json' ||
                contentType.essence === 'application/x-www-form-urlencoded'
            ) {
                let timeout;
                if (postTimeout) {
                    timeout = setTimeout(() => {
                        reject(new RequestError('Timeout reading POST data'));
                    }, postTimeout);
                }

                if (httpRequest.flora) httpRequest.flora.state = 'processing-post-data';

                // POST Form Data or JSON
                httpRequest.setEncoding(contentType.params.get('charset') || 'utf-8');
                httpRequest.on('data', (chunk) => {
                    payload += chunk;
                });

                httpRequest.on('aborted', () => {
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                    }
                    reject(new RequestError('HTTP request has been aborted'));
                });

                httpRequest.on('end', () => {
                    if (contentType.essence === 'application/x-www-form-urlencoded') {
                        payload = querystring.parse(payload);
                        Object.keys(payload).forEach((key) => {
                            if (!Object.hasOwn(opts, key)) {
                                if (Array.isArray(payload[key])) {
                                    if (httpRequest.flora) httpRequest.flora.state = 'processing';
                                    if (timeout) {
                                        clearTimeout(timeout);
                                        timeout = null;
                                    }
                                    reject(new RequestError(`Duplicate parameter "${key}" in Payload`));
                                    return;
                                }

                                opts[key] = payload[key];
                            }
                        });
                        if (!httpRequest.body) httpRequest.body = payload;
                    } else if (contentType.essence === 'application/json') {
                        try {
                            opts.data = JSON.parse(payload);
                        } catch {
                            if (httpRequest.flora) httpRequest.flora.state = 'processing';
                            if (timeout) {
                                clearTimeout(timeout);
                                timeout = null;
                            }
                            reject(new RequestError('Invalid payload, must be valid JSON'));
                            return;
                        }
                        if (!httpRequest.body) httpRequest.body = opts.data;
                    }

                    if (httpRequest.flora) httpRequest.flora.state = 'processing';
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                    }
                    resolve(new Request(opts));
                });
            } else {
                resolve(new Request(opts));
            }
        } else {
            resolve(new Request(opts));
        }
    });
}

module.exports = httpToFloraRequest;

'use strict';

const url = require('url');

const { RequestError } = require('flora-errors');

const Request = require('./request');

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
        if (!matches) return resolve();
        
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
    
        Object.keys(parsedUrl.query).forEach(key => {
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
        
        let payload = '';
    
        httpRequest.setEncoding('utf8');
        httpRequest.on('data', chunk => payload += chunk);
    
        httpRequest.on('end', () => {
            if (httpRequest.method == 'POST' && payload.length) {
                try {
                    opts.data = JSON.parse(payload);
                } catch(err) {
                    reject(new RequestError('Invalid payload, must be valid JSON'));
                    return;
                }
            }
    
            resolve(new Request(opts));
        });
        
        httpRequest.on('error', err => reject(new RequestError('Error reading HTTP-Request: '+err.message)));
    });
}

module.exports = httpToFloraRequest;

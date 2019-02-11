'use strict';

const path = require('path');

const flora = require('../../');

const server = new flora.Server(path.join(__dirname, 'config.js'));
server.run();

// http://localhost:3000/test/

// Event: "init"
// is called when Api is done initializing.
server.api.on('init', async () => {
    server.api.log.info('Extension: api init');
});

// Event: "close"
// is called when Api is closing.
server.api.on('close', async () => {
    server.api.log.info('Extension: api close');
});

// Event: "request"
// is called on each request, before the request is handled.
server.api.on('request', async ({ request /*, response */ }) => {
    server.api.log.info('Extension: api request');
    request.limit = 1; // modify the "limit" parameter
    request.select = 'foo'; // modify the "select" parameter to always select (only) the "foo" attribute
    // we could throw an error if something goes wrong here
});

// Event: "httpRequest"
// is called before any flora.Request instanciation and allows modifying HTTP headers
server.api.on('httpRequest', ({ /* httpRequest, */ httpResponse }) => {
    server.api.log.info('Extension: api httpRequest');
    httpResponse.setHeader('X-Hello', 'World');
});

// Event: "response"
// is called after the request is handled and before the response is sent.
server.api.on('response', async ({ /* request, */ response }) => {
    server.api.log.info('Extension: api response');

    // modify response: add "baz: 'foo'" property to the complete response
    if (Array.isArray(response.data)) {
        // list response
        if (response.data.length > 0) response.data[0].baz = 'foo';
    } else {
        // single response
        response.data.baz = 'foo';
    }
});

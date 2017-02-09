'use strict';

const path = require('path');

const flora = require('../../');

const server = new flora.Server(path.join(__dirname, 'config.js'));
server.run();

// http://localhost:8000/test/


// Extension: "init"
// is called when Api is done initializing.
// All extensions can be used synchronously when the "next" parameter is omitted, i.e. the function
// has < 2 parameters (so a "dummy" parameter is needed if "next" is used)

server.api.on('init', (ev, next) => {
    console.log('Extension: init');
    next();
});


// Extension: "close"
// is called when Api is closing.

server.api.on('close', (ev, next) => {
    console.log('Extension: close');
    next();
});


// Extension: "request"
// is called on each request, before the request is handled.

server.api.on('request', (ev, next) => {
    const { request, response } = ev;
    console.log('Extension: request');
    request.limit = 1; // modify the "limit" parameter
    request.select = 'foo'; // modify the "select" parameter to always select (only) the "foo" attribute
    next();
    // we could call `next(new Error(...))` if something goes wrong here
});

// Extension: "httpRequest"
// is called before any flora.Request instanciation and allows modifying HTTP headers

api.on('httpRequest', (ev) => {
    { httpRequest, httpResponse } = ev;
    httpResponse.setHeader('X-Hello', 'World');
});


// Extension: "preExecute" (global)
// is called after the request-resolver has resolved the dataSourceTree.
// The resources' "preExecute" extensions are called after the global one (because they
// are called for every (sub-) resource involved.

server.api.on('preExecute', (ev, next) => {
    const { dataSourceTree } = ev;
    console.log('Extension: preExecute');
    // ...
    next();
});


// Extension: "postExecute" (global)
// is called after the request has been executed and before the response is being built.
// The resources' "postExecute" extensions are called _before_ the global one.

server.api.on('postExecute', (ev, next) => {
    const { rawResults } = ev;
    console.log('Extension: postExecute');
    // ...
    next();
});


// Extension: "response"
// is called after the request is handled and before the response is sent.

server.api.on('response', (ev, next) => {
    const { response } = ev;
    console.log('Extension: response');

    // modify response: add "baz: 'foo'" property to the complete response
    if (Array.isArray(response.data)) {
        // list response
        if (response.data.length > 0) response.data[0].baz = 'foo';
    } else {
        // single response
        response.data.baz = 'foo';
    }
    next();
});

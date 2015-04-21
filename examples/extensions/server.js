'use strict';

var path = require('path');
var flora = require('../../');

var server = new flora.Server(path.join(__dirname, 'config.js'));
server.run();

// http://localhost:8000/test/


// "init" extension
// is called when Api is done initializing.
// All extensions can be used synchronously when the "next" parameter is omitted, i.e. the function
// has < 2 parameters (so a "dummy" parameter is needed if "next" is used)

server.api.on('init', function (dummy, next) {
    console.log('init');
    next();
});


// "request" extension
// is called on each request, before the request is handled.

server.api.on('request', function (request, next) {
    console.log('request');
    request.limit = 1; // modify the "limit" parameter
    request.select = 'foo'; // modify the "select" parameter to always select (only) the "foo" attribute
    next();
    // we could call `next(new Error(...))` if something goes wrong here
});


// "response" extension
// is called after the request is handled and before the response is sent.

server.api.on('response', function (response, next) {
    console.log('response');

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


// "preExecute" extension
// is called after the request-resolver has resolved the dataSourceTree.

server.api.on('preExecute', function (dataSourceTree, next) {
    console.log('preExecute');
    // ...
    next();
});


// "postExecute" extension
// is called after the request has been executed and before the response is being built

server.api.on('postExecute', function (rawResults, next) {
    console.log('postExecute');
    // ...
    next();
});

'use strict';

var path = require('path');
var flora = require('../');

var plugin = {
    register: function (api, options) {
        api.on('request', function (ev, next) {
            var request = ev.request;
            // ... do something with the request
            next();
        });
    }
};

var server = new flora.Server(path.join(__dirname, 'config.example.js'));
server.register(myPlugin, {foo: 'bar'});
server.run();

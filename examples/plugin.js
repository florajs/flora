'use strict';

const path = require('path');
const flora = require('../');

const myPlugin = {
    name: 'myPlugin',
    register: (api, options) => {
        api.on('request', (ev, next) => {
            const { request } = ev;
            // ... do something with the request
            next();
        });
    }
};

const server = new flora.Server(path.join(__dirname, 'config.example.js'));
server.register(myPlugin, { foo: 'bar' });
server.run();

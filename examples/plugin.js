'use strict';

const path = require('path');
const flora = require('../');

const myPlugin = {
    name: 'myPlugin',
    register: (api, options) => {
        api.on('request', async (ev) => {
            console.log(ev);
            const { request } = ev;
            // ... do something with the request
        });
    }
};

const server = new flora.Server(path.join(__dirname, 'config.example.js'));
server.register(myPlugin, { foo: 'bar' });
server.run();

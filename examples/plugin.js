'use strict';

const path = require('path');
const flora = require('../');

/**
 * @param {flora.Api} api 
 * @param {object} [options] 
 */
const myPlugin = (api, options) => {
    api.on('request', async ({ request }) => {
        api.log.debug('plugin got a request');
        // ... do something with the request
    });

    // Plugins can return values that are made available as api.getPlugin(name)
    return {
        foo: 'bar'
    };
};

const server = new flora.Server(path.join(__dirname, 'config.example.js'));
server.register('my', myPlugin, { bar: 'baz' });
server.run();

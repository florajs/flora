const path = require('path');
const flora = require('flora');

/*
 * Extend master functionality with master plugins
 */

/**
 * @param {flora.Master} api
 * @param {object} [options]
 */
const masterPlugin = (master /* , options */) => {
    master.on('init', () => {
        // Do things on cluster master init
    });

    master.on('shutdown', () => {
        // Do things before cluster master shutdown
    });
};

const master = new flora.Master(path.join(__dirname, 'config.example.js'));
master.register('my-master-plugin', masterPlugin);
master.run();

'use strict';

const fs = require('fs');
const path = require('path');
const _ = require('lodash');

let configParsers = {};
let configDirectory;

/**
 * Check if config directory exists.
 *
 * @param {string} directory
 * @return {boolean}
 * @private
 */
function directoryExists(directory) {
    try {
        fs.statSync(directory);
    } catch (e) {
        return false;
    }
    return true;
}

/**
 * @param {string} file
 * @return {boolean}
 * @private
 */
function isConfigFile(file) {
    return path.basename(file).indexOf('config.') !== -1;
}

/**
 * @param {string} file
 * @return {boolean}
 * @private
 */
function isResourceModule(file) {
    return path.basename(file) === 'index.js';
}

/**
 * Read config files from directory recursively.
 *
 * @param {string} directory
 * @param {object} resources
 * @return {Array}
 * @private
 */
function walk(directory, resources) {
    resources = resources || {};
    const cfgDirectory = configDirectory.substr(-1) === '/' ? configDirectory : configDirectory + '/';

    fs.readdirSync(directory)
        .map(entry => path.join(directory, entry))
        .forEach((entry) => {
            const stat = fs.statSync(entry);
            if (stat && stat.isDirectory()) walk(entry, resources);
            else {
                const resourceName = path.dirname(entry).replace(cfgDirectory, '');
                if (isConfigFile(entry)) {
                    if (!resources[resourceName]) resources[resourceName] = {};
                    resources[resourceName].configFile = entry;
                }
                if (isResourceModule(entry)) {
                    if (!resources[resourceName]) resources[resourceName] = {};
                    resources[resourceName].instanceFile = entry;
                }
            }
        });

    return resources;
}

/**
 * Load resource configs from config directory.
 *
 * @param {Object}      options             - Configure loader
 * @param {string}      options.directory   - Load configs from this directory.
 * @param {Object}      options.parsers     - Register cfg parsers (key: file ext, value: parser).
 * @param {Function}    callback
 */
module.exports = function configLoader(api, options, callback) {
    const cfg = {};

    _.merge(cfg, {
        directory: 'config',
        parsers: {}
    }, options);

    configDirectory = path.resolve(cfg.directory);
    configParsers = cfg.parsers;

    if (!directoryExists(configDirectory)) {
        return callback(new Error(`Config directory "${configDirectory}" does not exist`));
    }

    const resources = walk(configDirectory);

    // parse all configs
    return Promise.all(Object.keys(resources).map((resourceName) => {
        const file = resources[resourceName].configFile;
        if (!file) return null;

        const extension = path.extname(file);
        const type = extension.substr(1);
        const parseConfig = configParsers[type];

        if (!parseConfig) return Promise.reject(new Error(`No "${type}" config parser registered`));
        return new Promise((resolve, reject) => {
            api.log.trace('Parsing config for resource ' + resourceName);
            parseConfig(file, (err, config) => {
                if (err) return reject(err);
                delete resources[resourceName].configFile;
                resources[resourceName].config = config;
                return resolve();
            });
        });
    }))

    // load all resources
    .then(() => Promise.all(Object.keys(resources).map((resourceName) => {
        if (!resources[resourceName].instanceFile) return null;

        return new Promise((resolve /* , reject */) => {
            api.log.trace('Loading resource ' + resourceName);
            // eslint-disable-next-line global-require, import/no-dynamic-require
            resources[resourceName].instance = require(resources[resourceName].instanceFile)(api);
            delete resources[resourceName].instanceFile;
            resolve();
        });
    })))

    // done
    .then(() => callback(null, resources), callback);
};

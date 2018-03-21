'use strict';

const fs = require('fs');
const path = require('path');
const _ = require('lodash');

/**
 * Read config files from directory recursively.
 *
 * @param {string} configDirectory
 * @param {string} resourceName
 * @param {object} resources
 * @return {Array}
 * @private
 */
function walk(configDirectory, resourceName, resources) {
    resourceName = resourceName || '';
    resources = resources || {};

    fs.readdirSync(path.join(configDirectory, resourceName)).forEach((fileName) => {
        const subResourceName = (resourceName !== '' ? resourceName + '/' : '') + fileName;
        const absoluteFilePath = path.join(configDirectory, subResourceName);
        const stat = fs.statSync(absoluteFilePath);
        if (stat && stat.isDirectory()) {
            walk(configDirectory, subResourceName, resources);
        } else if (resourceName !== '') {
            if (fileName.startsWith('config.')) {
                if (!resources[resourceName]) resources[resourceName] = {};
                resources[resourceName].configFile = absoluteFilePath;
            }
            if (fileName === 'index.js') {
                if (!resources[resourceName]) resources[resourceName] = {};
                resources[resourceName].instanceFile = absoluteFilePath;
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
    let resources;

    _.merge(cfg, {
        directory: 'config',
        parsers: {}
    }, options);

    const configDirectory = path.resolve(cfg.directory);
    const configParsers = cfg.parsers;

    if (!fs.existsSync(configDirectory)) {
        return callback(new Error(`Config directory "${configDirectory}" does not exist`));
    }

    try {
        resources = walk(configDirectory);
    } catch (err) {
        err.message = 'Error reading resource directory tree: ' + err.message;
        return callback(err);
    }

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
                resources[resourceName].instance =
                    // eslint-disable-next-line global-require, import/no-dynamic-require
                    require(resources[resourceName].instanceFile)(api);
                delete resources[resourceName].instanceFile;
                resolve();
            });
        })))

        // done
        .then(() => callback(null, resources), callback);
};

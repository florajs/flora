/**
 * @module config-loader
 */
'use strict';

var Promise = require('when').Promise,
    path = require('path'),
    _ = require('lodash'),
    fs = require('fs');

var configParsers = {},
    configDirectory;

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
    var resources = resources || {};
    var cfgDirectory = configDirectory.substr(-1) === '/' ? configDirectory : configDirectory + '/';

    fs.readdirSync(directory)
        .map(function (entry) {
            return path.join(directory, entry);
        })
        .forEach(function (entry) {
            var stat = fs.statSync(entry);
            if (stat && stat.isDirectory()) walk(entry, resources);
            else {
                var resourceName = path.dirname(entry).replace(cfgDirectory, '');
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
 * @param {Object}      options.parsers     - Register config parsers (key: file extension, value: parser).
 * @param {Function}    callback
 */
module.exports = function (api, options, callback) {
    var cfg = {},
        resourceConfigs;

    _.merge(cfg, {
        directory: 'config',
        parsers: {}
    }, options);

    configDirectory = path.resolve(cfg.directory);
    configParsers = cfg.parsers;

    if (! directoryExists(configDirectory)) {
        return callback(new Error('Config directory "' + configDirectory + '" does not exist'));
    }

    var resources = walk(configDirectory);

    // parse all configs
    Promise.all(
        Object.keys(resources).map(function (resourceName) {
            var file = resources[resourceName].configFile;
            if (!file) return null;

            var extension = path.extname(file);
            var type = extension.substr(1);
            var parseConfig = configParsers[type];

            if (! parseConfig) return Promise.reject(new Error('No "' + type + '" config parser registered'));
            return new Promise(function (resolve, reject) {
                api.log.trace('Parsing config for resource ' + resourceName);
                parseConfig(file, function (err, config) {
                    if (err) return reject(err);
                    delete resources[resourceName].configFile;
                    resources[resourceName].config = config;
                    resolve();
                });
            });
        }))

        // load all resources
        .then(function () {
            return Promise.all(Object.keys(resources).map(function (resourceName) {
                if (!resources[resourceName].instanceFile) return null;

                return new Promise(function (resolve, reject) {
                    api.log.trace('Loading resource ' + resourceName);
                    resources[resourceName].instance = require(resources[resourceName].instanceFile)(api);
                    delete resources[resourceName].instanceFile;
                    resolve();
                });
            }));
        })

        // done
        .then(function () {
            callback(null, resources);
        }, callback);
};

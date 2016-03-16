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
 * Read config files from directory recursively.
 *
 * @param {string} directory
 * @return {Array}
 * @private
 */
function walk(directory) {
    var configs = [];

    fs.readdirSync(directory)
        .map(function (entry) {
            return path.join(directory, entry);
        })
        .forEach(function (entry) {
            var stat = fs.statSync(entry);
            if (stat && stat.isDirectory()) configs = configs.concat(walk(entry));
            else if (isConfigFile(entry)) configs.push(readConfigFile(entry));
        });

    return configs;
}

/**
 * Read config file using registered readers.
 *
 * @param {string} file
 * @return {Promise}
 * @private
 */
function readConfigFile(file) {
    var extension = path.extname(file),
        type = extension.substr(1),
        parseConfig = configParsers[type];

    if (! parseConfig) return Promise.reject(new Error('No "' + type + '" config parser registered'));

    return new Promise(function (resolve, reject) {
        parseConfig(file, function (err, config) {
            var obj = {};
            if (err) return reject(err);
            obj[file] = config;
            resolve(obj);
        });
    });
}

/**
 * Create config object from single resource configs.
 *
 * [
 *   { 'config/resource/config.xml': 'content' },
 *   { 'config/directory/resource/config.xml': 'content' },
 *   ....
 * ]
 *
 * {
 *   resource: 'content',
 *   'directory/resource': 'content'
 * }
 *
 * @param {Array.<Object>} resources
 * @return {Object}
 * @private
 */
function generateConfig(resources) {
    var config = {},
        cfgDirectory = configDirectory.substr(-1) === '/' ? configDirectory : configDirectory + '/';

    resources.forEach(function (resourceItem) {
        var file = Object.keys(resourceItem)[0],
            content = resourceItem[file],
            resource;

        resource = file.replace(cfgDirectory, '').replace(/\/config\..*$/, ''); // remove config directory + config file
        config[resource] = content;
    });

    return config;
}

/**
 * Load resource configs from config directory.
 *
 * @param {Object}      options             - Configure loader
 * @param {string}      options.directory   - Load configs from this directory.
 * @param {Object}      options.parsers     - Register config parsers (key: file extension, value: parser).
 * @param {Function}    callback
 */
module.exports = function (options, callback) {
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

    resourceConfigs = _.flatten(walk(configDirectory));
    Promise.all(resourceConfigs)
        .then(generateConfig)
        .then(function (configs) {
            callback(null, configs);
        }, callback);
};

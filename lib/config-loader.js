'use strict';

const fs = require('fs');
const path = require('path');

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
 * @param {Object} options Configure loader
 * @param {string} options.directory Load configs from this directory.
 * @param {Object} options.parsers Register cfg parsers (key: file ext, value: parser).
 * @return {Promise<Object>}
 */
module.exports = async function configLoader(api, options) {
    const cfg = {
        ...{
            directory: 'config',
            parsers: {}
        },
        ...options
    };
    let resources;

    const configDirectory = path.resolve(cfg.directory);
    const configParsers = cfg.parsers;

    if (!fs.existsSync(configDirectory)) {
        throw new Error(`Config directory "${configDirectory}" does not exist`);
    }

    try {
        resources = walk(configDirectory);
    } catch (err) {
        err.message = 'Error reading resource directory tree: ' + err.message;
        throw err;
    }

    // parse all configs
    await Promise.all(
        Object.keys(resources).map(async (resourceName) => {
            const file = resources[resourceName].configFile;
            if (!file) return null;

            const extension = path.extname(file);
            const type = extension.substring(1);
            const parseConfig = configParsers[type];

            if (!parseConfig) return Promise.reject(new Error(`No "${type}" config parser registered`));

            api.log.trace('Parsing config for resource ' + resourceName);
            try {
                resources[resourceName].config = await parseConfig(file);
                delete resources[resourceName].configFile;
            } catch (e) {
                e.message = `Error parsing resource "${resourceName}": ${e.message}`;
                throw e;
            }
        })
    );

    // load all resources
    await Promise.all(
        Object.keys(resources).map((resourceName) => {
            if (!resources[resourceName].instanceFile) return null;

            return new Promise((resolve /* , reject */) => {
                api.log.trace('Loading resource ' + resourceName);
                // eslint-disable-next-line global-require
                resources[resourceName].instance = require(resources[resourceName].instanceFile)(api);

                delete resources[resourceName].instanceFile;
                resolve();
            });
        })
    );

    // done
    return resources;
};

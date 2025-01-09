'use strict';

const fs = require('node:fs/promises');
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
async function walk(configDirectory, resourceName, resources) {
    resourceName = resourceName || '';
    resources = resources || {};

    for (const fileName of await fs.readdir(path.join(configDirectory, resourceName))) {
        const subResourceName = (resourceName !== '' ? resourceName + '/' : '') + fileName;
        const absoluteFilePath = path.join(configDirectory, subResourceName);
        const stat = await fs.stat(absoluteFilePath);
        if (stat && stat.isDirectory()) {
            await walk(configDirectory, subResourceName, resources);
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
    }

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

    if (
        !(await fs
            .access(configDirectory)
            .then(() => true)
            .catch(() => false))
    ) {
        throw new Error(`Config directory "${configDirectory}" does not exist`);
    }

    try {
        resources = await walk(configDirectory);
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

            return new Promise((resolve, reject) => {
                api.log.trace('Loading resource ' + resourceName);
                const resourceFunction = require(resources[resourceName].instanceFile);
                if (typeof resourceFunction !== 'function') {
                    return reject(
                        new Error(`Resource does not export a function: ${resources[resourceName].instanceFile}`)
                    );
                }
                resources[resourceName].instance = resourceFunction(api);

                delete resources[resourceName].instanceFile;
                resolve();
            });
        })
    );

    // done
    return resources;
};

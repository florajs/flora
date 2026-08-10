'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

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

    const resources = {};
    for await (const entry of fs.glob('*/**/{config.*,index.js}', { cwd: configDirectory, withFileTypes: true })) {
        if (!entry.isFile()) continue;

        const resourceName = path.relative(configDirectory, entry.parentPath).split(path.sep).join('/');
        const absoluteFilePath = path.join(entry.parentPath, entry.name);

        resources[resourceName] ??= {};
        if (entry.name.startsWith('config.')) resources[resourceName].configFile = absoluteFilePath;
        if (entry.name === 'index.js') resources[resourceName].instanceFile = absoluteFilePath;
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

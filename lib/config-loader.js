'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { ImplementationError } = require('@florajs/errors');

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

    try {
        await fs.access(configDirectory);
    } catch (err) {
        throw new ImplementationError(`Cannot access config directory "${configDirectory}"`, { cause: err });
    }

    const resources = {};

    const globOptions = { cwd: configDirectory, withFileTypes: true };
    for await (const entry of fs.glob('*/**/{config.*,index.{js,ts}}', globOptions)) {
        if (!entry.isFile()) continue;

        const resourceName = path.relative(configDirectory, entry.parentPath).split(path.sep).join('/');
        const absoluteFilePath = path.join(entry.parentPath, entry.name);

        resources[resourceName] ??= {};

        if (entry.name.startsWith('config.')) {
            const type = path.extname(entry.name).substring(1);
            const parseConfig = configParsers[type];

            if (!parseConfig) throw new ImplementationError(`No "${type}" config parser registered`);

            api.log.trace(`Parsing config for resource ${resourceName}`);
            try {
                resources[resourceName].config = await parseConfig(absoluteFilePath);
            } catch (err) {
                throw new ImplementationError(`Error parsing resource "${resourceName}"`, { cause: err });
            }
        }

        if (entry.name === 'index.js' || entry.name === 'index.ts') {
            api.log.trace(`Loading resource ${resourceName}`);
            const resourceImport = require(absoluteFilePath);

            let resourceFunction;
            if (resourceImport?.__esModule === true && typeof resourceImport.default === 'function') {
                resourceFunction = resourceImport.default;
            }

            if (typeof resourceImport === 'function') {
                resourceFunction = resourceImport;
            }

            if (!resourceFunction) {
                throw new ImplementationError(`Resource does not export a function: ${absoluteFilePath}`);
            }
            resources[resourceName].instance = resourceFunction(api);
        }
    }

    return resources;
};

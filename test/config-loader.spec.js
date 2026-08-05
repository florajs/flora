'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fsMock = require('mock-fs');
// const sinon = require('sinon');
const nullLogger = require('abstract-logging');

const configLoader = require('../lib/config-loader');

const log = nullLogger;
log.child = () => log;

// mock Api instance
const api = { log };

function parseXml(/* file */) {
    // fake parser for tests
    return Promise.resolve('xml config');
}

describe('config-loader', () => {
    it('should issue an error if config directory does not exist', async () => {
        const directory = require('path').resolve('nonexistent-directory');

        await assert.rejects(
            configLoader(api, { directory }),
            new Error(`Config directory "${directory}" does not exist`)
        );
    });

    it('should read configs from directories', async () => {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.xml': '' }
            }
        });

        const cfg = {
            parsers: { xml: parseXml }
        };

        const configs = await configLoader(api, cfg);

        assert.deepEqual(configs, {
            resource1: { config: 'xml config' },
            resource2: { config: 'xml config' }
        });
    });

    it('should read configs recursively', async () => {
        fsMock({
            config: {
                groupfolder1: {
                    resource: {
                        'config.xml': ''
                    }
                },
                groupfolder2: {
                    groupfolder3: {
                        resource: {
                            'config.xml': ''
                        }
                    }
                },
                subDirectory3: {} // omit in result
            }
        });

        const cfg = {
            parsers: { xml: parseXml }
        };

        const configs = await configLoader(api, cfg);

        assert.deepEqual(configs, {
            'groupfolder1/resource': { config: 'xml config' },
            'groupfolder2/groupfolder3/resource': { config: 'xml config' }
        });
    });

    it('should strip path to config directory from resource', async () => {
        fsMock({
            configs: {
                are: {
                    stored: {
                        in: {
                            deep: {
                                directory: {
                                    structure: {
                                        resource1: { 'config.xml': '' },
                                        resource2: { 'config.xml': '' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const cfg = {
            directory: 'configs/are/stored/in/deep/directory/structure',
            parsers: { xml: parseXml }
        };

        const configs = await configLoader(api, cfg);

        assert.deepEqual(configs, {
            resource1: { config: 'xml config' },
            resource2: { config: 'xml config' }
        });
    });

    it('should strip path also for relative paths', async () => {
        fsMock({
            configs: {
                'relative-path': {
                    resource1: { 'config.xml': '' }
                }
            }
        });

        const cfg = {
            directory: 'configs/relative-path/../relative-path',
            parsers: { xml: parseXml }
        };

        const configs = await configLoader(api, cfg);

        assert.deepEqual(configs, {
            resource1: { config: 'xml config' }
        });
    });

    it('should issue an error if no parser is found for a file extension extension', async () => {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.json': '' }
            }
        });

        const cfg = {
            parsers: { xml: parseXml }
        };

        await assert.rejects(configLoader(api, cfg), new Error('No "json" config parser registered'));
    });

    it('should register additional loaders', async () => {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.json': '' }
            }
        });

        const cfg = {
            parsers: {
                xml: parseXml,
                json: () => Promise.resolve('json config')
            }
        };

        const configs = await configLoader(api, cfg);

        assert.deepEqual(configs, {
            resource1: { config: 'xml config' },
            resource2: { config: 'json config' }
        });
    });

    it('should ignore all other but config files', async () => {
        fsMock({
            config: {
                groupfolder1: {
                    resource: { 'config.xml': '' }
                },
                groupfolder2: {
                    groupfolder3: {
                        'readme.txt': '',
                        resource: { 'config.xml': '' }
                    }
                },
                subDirectory3: {
                    // omit in result
                    'file.doc': ''
                }
            }
        });

        const cfg = {
            parsers: { xml: parseXml }
        };

        const configs = await configLoader(api, cfg);

        assert.deepEqual(configs, {
            'groupfolder1/resource': { config: 'xml config' },
            'groupfolder2/groupfolder3/resource': { config: 'xml config' }
        });
    });

    describe('loading resources from TypeScript (.ts) index files', () => {
        let dir;

        afterEach(async () => {
            await fs.promises.rm(dir, { recursive: true, force: true });
        });

        /**
         * require() reads through the real fs module, so mock-fs (which only patches
         * the public fs API, not the internal bindings the CJS loader uses to resolve
         * and load modules) can't be used to test instance-file loading. Write real,
         * throwaway files to disk instead.
         */
        async function createTmpResourceDir(instanceFileName, instanceFileContent) {
            const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'flora-config-loader-'));
            await fs.promises.mkdir(path.join(dir, 'resource1'));
            await fs.promises.writeFile(path.join(dir, 'resource1', instanceFileName), instanceFileContent);
            return dir;
        }

        it('should load a resource from an index.ts file', async () => {
            dir = await createTmpResourceDir(
                'index.ts',
                "export default (api: unknown) => ({ language: 'typescript' });"
            );

            const configs = await configLoader(api, { directory: dir });
            assert.deepEqual(configs.resource1.instance, { language: 'typescript' });
        });

        it('should issue an error if the ESM default export is not a function', async () => {
            dir = await createTmpResourceDir('index.ts', "export default 'not-a-function';");

            await assert.rejects(configLoader(api, { directory: dir }), (err) => {
                assert.equal(err.name, 'ImplementationError');
                assert.ok(err.message.startsWith('Resource does not export a function: '));
                assert.ok(err.message.endsWith('resource1/index.ts'));
                return true;
            });
        });
    });

    it('should load our example resources (integration)', async () => {
        const cfg = {
                directory: __dirname + '/fixtures/resources',
                parsers: { xml: require('../lib/xml-reader') }
            },
            resourcesLoaded = require(__dirname + '/fixtures/resources-loaded.json');

        const configs = await configLoader(api, cfg);

        // for manually generating fixture:
        //console.log(JSON.stringify(configs, null, 4));
        assert.deepEqual(configs, resourcesLoaded);
    });

    afterEach(() => {
        fsMock.restore(); // restore original node.js fs module
    });
});

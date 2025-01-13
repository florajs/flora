'use strict';

const path = require('node:path');
const { EventEmitter, once } = require('node:events');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const nullLogger = require('abstract-logging');

const { Api } = require('../');
const Request = require('../lib/request');

const log = nullLogger;
log.child = () => log;

const resourcesPath = path.join(__dirname, 'fixtures', 'empty-resources');

const testDataSource = function testDataSource() {
    return {
        process: (/* request */) => ({
            data: [],
            totalCount: null
        }),
        prepare: () => {}
    };
};

describe('Api', () => {
    it('should be a function', () => {
        assert.equal(typeof Api, 'function');
    });

    it('should be instantiable', () => {
        assert.equal(typeof new Api(), 'object');
    });

    it('should be an EventEmitter', () => {
        assert.ok(new Api() instanceof EventEmitter);
    });

    it('should emit `init` when initialized', async () => {
        const api = new Api();
        process.nextTick(() => api.init({ log }));
        return once(api, 'init', { signal: AbortSignal.timeout(100) });
    });

    it('should emit `close` when closed', async () => {
        const api = new Api();
        api.on('init', () => api.close());
        process.nextTick(() => api.init({ log }));
        return once(api, 'close', { signal: AbortSignal.timeout(100) });
    });

    it('should return an error when closed without init', async () => {
        const api = new Api();
        await assert.rejects(api.close(), new Error('Not running'));
    });

    it('should call the callback after close is called', async (ctx) => {
        const api = new Api();
        const callbackFn = ctx.mock.fn(() => {});
        await api
            .init({ log })
            .then(() => api.close())
            .then(callbackFn);

        assert.equal(callbackFn.mock.callCount(), 1);
    });

    it('should initialize even without a config object', async () => {
        const api = new Api();
        await assert.doesNotReject(api.init({ resourcesPath }));
    });

    it('should fail to initialize with invalid timezone', async () => {
        const api = new Api();

        await assert.rejects(
            api.init({
                log,
                timezone: 'America/Bogus'
            }),
            new Error('Timezone "America/Bogus" does not exist')
        );
    });

    it('should initialize a default logger', async () => {
        const api = new Api();
        await api.init({ resourcesPath });
        assert.equal(typeof api.log, 'object');
    });

    it('should initialize dataSources', async (ctx) => {
        const api = new Api();
        const dsConstructor = ctx.mock.fn(testDataSource);
        await api.init({
            log,
            resourcesPath,
            dataSources: {
                test: { constructor: dsConstructor }
            }
        });

        assert.equal(dsConstructor.mock.callCount(), 1);
    });

    it('should fail to initialize if dataSource lacks constructor', async () => {
        await assert.rejects(
            new Api().init({
                log,
                resourcesPath,
                dataSources: {
                    test: { constructor: 'foo' }
                }
            }),
            new Error('Data source configuration for "test" does not have a constructor function')
        );
    });

    it('should fail to initialize if dataSource is invalid', async () => {
        await assert.rejects(
            new Api().init({
                log,
                resourcesPath,
                dataSources: { test: 'foo' }
            }),
            new Error('Data source configuration for "test" needs to be an object')
        );
    });

    describe('plugins', () => {
        it('should allow to register plugins', (ctx) => {
            const plugin = ctx.mock.fn(() => {});

            const api = new Api();
            api.register('my', plugin);

            assert.equal(plugin.mock.callCount(), 1);
            assert.doesNotThrow(() => api.getPlugin('my'));
        });

        it('should allow plugins registered before init', async (ctx) => {
            const plugin = ctx.mock.fn(() => {});
            const api = new Api();

            api.register('my', plugin);
            await api.init({ log, resourcesPath });

            assert.equal(plugin.mock.callCount(), 1);
            assert.doesNotThrow(() => api.getPlugin('my'));
        });

        it('should allow plugins registered after init', async (ctx) => {
            const plugin = ctx.mock.fn(() => {});
            const api = new Api();

            await api.init({ log, resourcesPath });
            api.register('my', plugin);

            assert.equal(plugin.mock.callCount(), 1);
            assert.doesNotThrow(() => api.getPlugin('my'));
        });

        it('should pass through plugin options', async (ctx) => {
            const plugin = ctx.mock.fn(() => {});
            const api = new Api();

            api.register('my', plugin, { foo: 'bar' });
            await api.init({ log, resourcesPath });

            const [call] = plugin.mock.calls;
            assert.equal(call.arguments.length, 2);
            const [, options] = call.arguments;
            assert.ok(Object.hasOwn(options, 'foo'));
            assert.equal(options.foo, 'bar');
        });

        it('should provide plugin data at getPlugin', async () => {
            const plugin = (api, options) => ({
                bar: 'baz',
                options
            });

            const api = new Api();
            api.register('my', plugin, { foo: 'bar' });
            await api.init({ log, resourcesPath });

            const pluginData = api.getPlugin('my');
            assert.deepEqual(pluginData, {
                bar: 'baz',
                options: { foo: 'bar' }
            });
        });

        it('getPlugin should throw an error for unknown plugins', async () => {
            const api = new Api();
            await api.init({ log, resourcesPath });
            assert.throws(() => api.getPlugin('unknown'), new Error('Plugin "unknown" is not registered'));
        });
    });

    describe('execute', () => {
        it('should fail when resource is unknown', async () => {
            const api = new Api();
            const request = new Request({ resource: 'foo' });

            await api.init({
                log,
                resourcesPath,
                dataSources: {
                    test: {
                        constructor: testDataSource
                    }
                }
            });

            await assert.rejects(() => api.execute(request), {
                name: 'NotFoundError',
                message: 'Unknown resource "foo" in request'
            });

            await api.close();
        });

        it('should fail when action does not exist', async () => {
            const api = new Api();
            const request = new Request({ resource: 'no-actions' });

            await api.init({
                log,
                resourcesPath,
                dataSources: {
                    test: { constructor: testDataSource }
                }
            });

            // mock empty resource:
            api.resourceProcessor.resourceConfigs['no-actions'] = {
                config: {},
                instance: {}
            };

            await assert.rejects(() => api.execute(request), {
                name: 'RequestError',
                message: 'Action "retrieve" is not implemented'
            });

            await api.close();
        });

        it('should fail when index.js does not export a function', async () => {
            await assert.rejects(
                new Api().init({
                    log,
                    resourcesPath: path.join(__dirname, 'fixtures', 'wrong-export', 'resources')
                }),
                (err) => err.message.startsWith('Resource does not export a function: ')
            );
        });

        it('should fail when Api#init is not done', async () => {
            const api = new Api();
            const request = new Request({ resource: 'foo' });

            api.init({
                log,
                resourcesPath,
                dataSources: {
                    test: {
                        constructor: testDataSource
                    }
                }
            });

            await assert.rejects(api.execute(request), {
                message: 'Not initialized'
            });
        });

        it('should clone the Request', async () => {
            const api = new Api();

            await api.init({
                log,
                resourcesPath: path.join(__dirname, 'fixtures', 'extensions', 'resources'),
                dataSources: {
                    empty: {
                        constructor: testDataSource
                    }
                }
            });

            const r = new Request({ resource: 'simple-js' });
            const { request } = await api.execute(r);

            assert.notEqual(request, r);
        });

        it('should pass through _auth property', async () => {
            const api = new Api();

            await api.init({
                log,
                resourcesPath: path.join(__dirname, 'fixtures', 'extensions', 'resources'),
                dataSources: {
                    empty: {
                        constructor: testDataSource
                    }
                }
            });

            const r = new Request({ resource: 'simple-js', _auth: 'AUTH' });
            const { request } = await api.execute(r);

            assert.ok(Object.hasOwn(request, '_auth'));
            assert.equal(request._auth, 'AUTH');
        });
    });

    describe('formats', () => {
        let api;

        before(async () => {
            api = new Api();
            await api.init({
                log,
                resourcesPath: path.join(__dirname, 'fixtures', 'extensions', 'resources'),
                dataSources: {
                    empty: {
                        constructor: testDataSource
                    }
                }
            });
        });

        after(() => api.close());

        it('default format when action is function', async () => {
            const request = new Request({ resource: 'simple-js' });
            const response = await api.execute(request);
            assert.equal(response.data.called, 'retrieve-default');
        });

        it('default format when action is async function', async () => {
            const request = new Request({ resource: 'simple-js', action: 'retrieveAsync' });
            const response = await api.execute(request);
            assert.equal(response.data.called, 'retrieveAsync-default');
        });

        it('default format when action is object', async () => {
            const request = new Request({ resource: 'simple-js', action: 'formats' });
            const response = await api.execute(request);
            assert.equal(response.data.called, 'formats-default');
        });

        it('default format when format is "json"', async () => {
            const request = new Request({ resource: 'simple-js', action: 'formats', format: 'json' });
            const response = await api.execute(request);
            assert.equal(response.data.called, 'formats-default');
        });

        it('specific format when action is object', async () => {
            const request = new Request({ resource: 'simple-js', action: 'formats', format: 'image' });
            const response = await api.execute(request);
            assert.equal(response.data.called, 'formats-image');
        });

        it('should fail when action is function and format is not default', async () => {
            const request = new Request({ resource: 'simple-js', format: 'unknown' });

            await assert.rejects(api.execute(request), {
                name: 'RequestError',
                message: 'Invalid format "unknown" for action "retrieve"'
            });
        });

        it('should fail when action is object and format is invalid', async () => {
            const request = new Request({ resource: 'simple-js', action: 'formats', format: 'unknown' });

            await assert.rejects(api.execute(request), {
                name: 'RequestError',
                message: 'Invalid format "unknown" for action "formats"'
            });
        });
    });
});

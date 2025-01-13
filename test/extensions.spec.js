'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('events');

const nullLogger = require('abstract-logging');

const { Api } = require('../');
const Request = require('../lib/request');

const log = nullLogger;
log.child = () => log;
const resourcesPath = path.join(__dirname, 'fixtures', 'extensions', 'resources');

const testDataSource = function testDataSource() {
    return {
        process: async (/* request */) => ({
            data: [
                {
                    id: 1,
                    foo: 'bar'
                },
                {
                    id: 2,
                    foo: 'baz'
                }
            ],
            totalCount: null
        }),
        prepare: () => {},
        close: async () => {}
    };
};

const testConfig = {
    log: log,
    resourcesPath: resourcesPath,
    dataSources: {
        empty: {
            constructor: testDataSource,
            close: async () => {}
        }
    }
};

describe('extensions', () => {
    describe('Api', () => {
        describe('init', () => {
            it('is emitted when the instance is initialized', async (ctx) => {
                const api = new Api();

                process.nextTick(() => api.init({ log }));
                ctx.after(() => api.close());

                return once(api, 'init');
            });

            it('can be called asynchronously', async () => {
                const api = new Api();

                let initEmitted = false;
                api.on('init', async (/* ev */) => {
                    initEmitted = true;
                });

                await api.init({ log });
                assert.equal(initEmitted, true);
                await api.close();
            });
        });

        describe('request', () => {
            it('is emitted when a request is made', async () => {
                const api = new Api();

                await api.init({ log });

                api.on('request', (ev) => {
                    assert.equal(typeof ev, 'object');
                    assert.equal(typeof ev.request, 'object');
                    assert.equal(ev.request.resource, 'test');
                });

                const request = new Request({ resource: 'test' });
                await assert.rejects(api.execute(request), {
                    message: 'Unknown resource "test" in request',
                    code: 'ERR_NOT_FOUND'
                });
                await api.close();
            });
        });

        describe('response', () => {
            it('is emitted before a response is sent', async () => {
                const api = new Api();

                await api.init(testConfig);

                let emitted = false;
                api.on('response', (ev) => {
                    assert.equal(typeof ev, 'object');
                    assert.equal(typeof ev.response, 'object');
                    assert.ok(Array.isArray(ev.response.data));
                    emitted = true;
                });

                const request = new Request({ resource: 'test' });
                await api.execute(request);
                assert.equal(emitted, true);
                await api.close();
            });
        });

        describe('close', () => {
            it('is emitted when the instance is closed', async () => {
                const api = new Api();
                api.on('init', () => {
                    api.close();
                });

                api.init({ log });

                return once(api, 'close');
            });
        });
    });

    describe('resource', () => {
        describe('init', () => {
            it('is emitted once when the resource is called for the first time', async () => {
                const api = new Api();

                await api.init(testConfig);
                const resource = api.getResource('test');
                assert.equal(resource._initCalled(), 1);
                await api.close();
            });

            it('is emitted only once', async () => {
                const api = new Api();

                await api.init(testConfig);
                const resource = api.getResource('test');

                const request = new Request({ resource: 'test' });
                await api.execute(request);
                assert.equal(resource._initCalled(), 1);
                await api.close();
            });
        });

        describe('item', () => {
            it('is emitted when an item is handled', async () => {
                const api = new Api();

                await api.init(testConfig);

                const request = new Request({ resource: 'test' });
                api.on('response', (ev) => {
                    assert.equal(typeof ev, 'object');
                    assert.equal(typeof ev.response, 'object');
                    assert.ok(Array.isArray(ev.response.data));
                    assert.ok(ev.response.data.length > 0);
                    assert.deepEqual(ev.response.data[0], {
                        id: 1,
                        bar: 'baz' // this is set by "item" callback, see fixtures/extensions/test/index.js
                    });
                });

                await api.execute(request);
                await api.close();
            });
        });

        describe('preExecute', () => {
            it('is emitted with a dataSourceTree', async () => {
                const api = new Api();

                await api.init(testConfig);

                const request = new Request({ resource: 'test' });
                api.on('response', (ev) => {
                    assert.equal(typeof ev, 'object');
                    assert.equal(typeof ev.response, 'object');

                    // this is set by "preExecute" callback, see fixtures/extensions/test/index.js
                    assert.equal(typeof ev.request._preExecuteArgs, 'object');
                    assert.equal(typeof ev.request._preExecuteArgs.dataSourceTree, 'object');
                });

                await api.execute(request);
                await api.close();
            });
        });

        describe('postExecute', () => {
            it('is emitted with rawResults', async () => {
                const api = new Api();

                await api.init(testConfig);
                const request = new Request({ resource: 'test' });

                api.on('response', (ev) => {
                    assert.equal(typeof ev, 'object');
                    assert.equal(typeof ev.response, 'object');

                    // this is set by "postExecute" callback, see fixtures/extensions/test/index.js
                    assert.equal(typeof ev.request._postExecuteArgs, 'object');
                    assert.equal(typeof ev.request._postExecuteArgs.rawResults, 'object');
                    assert.ok(Array.isArray(ev.request._postExecuteArgs.rawResults.data));
                });

                await api.execute(request);
                await api.close();
            });
        });
    });
});

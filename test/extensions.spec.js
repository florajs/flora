'use strict';

const path = require('path');

const chai = require('chai');
const bunyan = require('bunyan');

const { Api } = require('../');
const Request = require('../lib/request');

const expect = chai.expect;
chai.use(require('sinon-chai'));

const log = bunyan.createLogger({ name: 'null', streams: [] });
const resourcesPath = path.join(__dirname, 'fixtures', 'extensions', 'resources');

const testDataSource = function testDataSource() {
    return {
        process: async (request) => ({
            data: [{
                id: 1,
                foo: 'bar'
            }, {
                id: 2,
                foo: 'baz'
            }],
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
            it('is emitted when the instance is initialized', (done) => {
                const api = new Api();

                api.on('init', async () => {
                    await api.close();
                    done();
                });

                api.init({ log });
            });

            it('can be called asynchronously', async () => {
                const api = new Api();

                let initEmitted = false;
                api.on('init', async (ev) => {
                    initEmitted = true;
                });

                await api.init({ log });
                expect(initEmitted).to.eql(true);
                await api.close();
            });
        });

        describe('request', () => {
            it('is emitted when a request is made', async () => {
                const api = new Api();

                await api.init({ log });

                api.on('request', (ev) => {
                    expect(ev).to.be.an('object');
                    expect(ev.request).to.be.an('object');
                    expect(ev.request.resource).to.eql('test');
                });

                const request = new Request({ resource: 'test' });
                try {
                    await api.execute(request);
                } catch (err) {
                    // ignore 'Unknown resource "test"'
                    if (err.code !== 'ERR_NOT_FOUND') throw err;
                }
                await api.close();
            });
        });

        describe('response', () => {
            it('is emitted before a response is sent', async () => {
                const api = new Api();

                await api.init(testConfig);

                let emitted = false;
                api.on('response', (ev) => {
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');
                    expect(ev.response.data).to.be.an('array');
                    emitted = true;
                });

                const request = new Request({ resource: 'test' });
                await api.execute(request);
                expect(emitted).to.eql(true);
                await api.close();
            });
        });

        describe('close', () => {
            it('is emitted when the instance is closed', (done) => {
                let closeCalled = false;

                const api = new Api();
                api.on('init', () => {
                    api.close();
                });

                api.on('close', done);

                api.init({ log });
            });
        });
    });

    describe('resource', () => {
        describe('init', () => {
            it('is emitted once when the resource is called for the first time', async () => {
                const api = new Api();

                await api.init(testConfig);
                const resource = api.getResource('test');
                expect(resource._initCalled()).to.equal(1);
                await api.close();
            });

            it('is emitted only once', async () => {
                const api = new Api();

                await api.init(testConfig);
                const resource = api.getResource('test');

                const request = new Request({ resource: 'test' });
                await api.execute(request);
                expect(resource._initCalled()).to.equal(1);
                await api.close();
            });
        });

        describe('item', () => {
            it('is emitted when an item is handled', async () => {
                const api = new Api();

                await api.init(testConfig)

                const request = new Request({ resource: 'test' });
                api.on('response', (ev) => {
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');
                    expect(ev.response.data).to.be.an('array');
                    expect(ev.response.data.length).to.greaterThan(0);
                    expect(ev.response.data[0]).to.eql({
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

                const request = new Request({resource: 'test'});
                api.on('response', (ev) => {
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');

                    // this is set by "preExecute" callback, see fixtures/extensions/test/index.js
                    expect(ev.request._preExecuteArgs).to.be.an('object');
                    expect(ev.request._preExecuteArgs.dataSourceTree).to.be.an('object');
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
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');

                    // this is set by "postExecute" callback, see fixtures/extensions/test/index.js
                    expect(ev.request._postExecuteArgs).to.be.an('object');
                    expect(ev.request._postExecuteArgs.rawResults).to.be.an('object');
                    expect(ev.request._postExecuteArgs.rawResults.data).to.be.an('array');
                });

                await api.execute(request);
                await api.close();
            });
        });
    });
});

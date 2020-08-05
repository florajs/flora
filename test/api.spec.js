/* global describe, it, before, after */

'use strict';

const path = require('path');
const { EventEmitter } = require('events');

const { expect } = require('chai');
const bunyan = require('bunyan');

const { Api } = require('../');
const Request = require('../lib/request');

const log = bunyan.createLogger({ name: 'null', streams: [] });
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
        expect(Api).to.be.a('function');
    });

    it('should be instantiable', () => {
        expect(new Api()).to.be.an('object');
    });

    it('should be an EventEmitter', () => {
        expect(new Api()).to.be.instanceof(EventEmitter);
    });

    it('should emit `init` when initialized', (done) => {
        const api = new Api();
        api.on('init', () => done());
        api.init({ log });
    });

    it('should emit `close` when closed', (done) => {
        const api = new Api();
        api.on('init', () => api.close());
        api.on('close', () => done());
        api.init({ log });
    });

    it('should return an error when closed without init', (done) => {
        const api = new Api();
        api.close().catch((err) => {
            expect(err).to.be.an.instanceof(Error);
            expect(err.message).to.equal('Not running');
            done();
        });
    });

    it('should call the callback after close is called', (done) => {
        const api = new Api();
        api.init({ log })
            .then(() => api.close())
            .then(() => done())
            .catch((err) => done(err));
    });

    it('should initialize even without a config object', (done) => {
        const api = new Api();
        api.init({ resourcesPath })
            .then(() => done())
            .catch(done);
    });

    it('should initialize a default logger', (done) => {
        const api = new Api();
        api.init({ resourcesPath })
            .then(() => {
                expect(api.log).to.be.an('object');
                done();
            })
            .catch(done);
    });

    it('should initialize dataSources', (done) => {
        const api = new Api();
        api.init({
            log,
            resourcesPath,
            dataSources: {
                test: { constructor: testDataSource }
            }
        })
            .then(() => done())
            .catch(done);
    });

    it('should fail to initialize if dataSource lacks constructor', (done) => {
        const api = new Api();
        api.init({
            log,
            resourcesPath,
            dataSources: {
                test: { constructor: 'foo' }
            }
        }).catch((err) => {
            expect(err).to.be.an.instanceof(Error);
            done();
        });
    });

    it('should fail to initialize if dataSource is invalid', (done) => {
        const api = new Api();
        api.init({
            log,
            resourcesPath,
            dataSources: { test: 'foo' }
        }).catch((err) => {
            expect(err).to.be.an.instanceof(Error);
            done();
        });
    });

    describe('plugins', () => {
        it('should allow to register plugins', (done) => {
            const plugin = (/* api */) => done();

            const api = new Api();
            api.register('my', plugin);
        });

        it('should allow plugins registered before init', (done) => {
            const plugin = (/* api */) => done();

            const api = new Api();
            api.register('my', plugin);
            api.init({
                log,
                resourcesPath
            });
        });

        it('should allow plugins registered after init', (done) => {
            const plugin = (/* api */) => done();

            const api = new Api();
            api.init({
                log,
                resourcesPath
            }).then(() => {
                api.register('my', plugin);
            });
        });

        it('should pass through plugin options', (done) => {
            const plugin = (api, options) => {
                expect(options).to.eql({ foo: 'bar' });
                done();
            };

            const api = new Api();
            api.register('my', plugin, { foo: 'bar' });
            api.init({
                log,
                resourcesPath
            });
        });

        it('should provide plugin data at getPlugin', (done) => {
            const plugin = (api, options) => {
                return {
                    bar: 'baz',
                    options
                };
            };

            const api = new Api();
            api.register('my', plugin, { foo: 'bar' });
            api.init({
                log,
                resourcesPath
            }).then(() => {
                const pluginData = api.getPlugin('my');
                expect(pluginData).to.eql({
                    bar: 'baz',
                    options: { foo: 'bar' }
                });
                done();
            });
        });

        it('getPlugin should return null for unknown plugins', (done) => {
            const api = new Api();
            api.init({
                log,
                resourcesPath
            }).then(() => {
                try {
                    api.getPlugin('unknown');
                } catch (err) {
                    expect(err).to.be.an('error');
                    expect(err.message).to.equal('Plugin "unknown" is not registered');
                    done();
                }
            });
        });
    });

    describe('execute', () => {
        it('should fail when resource is unknown', (done) => {
            const api = new Api();
            api.init({
                log,
                resourcesPath,
                dataSources: {
                    test: {
                        constructor: testDataSource
                    }
                }
            })
                .then(() => {
                    const request = new Request({ resource: 'foo' });
                    return api.execute(request);
                })
                .catch((err) => {
                    expect(err).to.be.an('error');
                    expect(err.message).to.equal('Unknown resource "foo" in request');
                    api.close().then(() => done());
                });
        });

        it('should fail when action does not exist', (done) => {
            const api = new Api();
            api.init({
                log,
                resourcesPath,
                dataSources: {
                    test: { constructor: testDataSource }
                }
            })
                .then(() => {
                    // mock empty resource:
                    api.resourceProcessor.resourceConfigs['no-actions'] = {
                        config: {},
                        instance: {}
                    };

                    var request = new Request({
                        resource: 'no-actions'
                    });
                    return api.execute(request);
                })
                .catch((err) => {
                    expect(err).to.be.an('error');
                    expect(err.message).to.equal('Action "retrieve" is not implemented');
                    api.close().then(() => done());
                });
        });

        it('should fail when Api#init is not done', (done) => {
            const api = new Api();
            api.init({
                log,
                resourcesPath,
                dataSources: {
                    test: {
                        constructor: testDataSource
                    }
                }
            });

            var request = new Request({ resource: 'foo' });
            api.execute(request).catch((err) => {
                expect(err).to.be.an('error');
                expect(err.message).to.equal('Not initialized');
                done();
            });
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
            expect(response.data.called).to.equal('retrieve-default');
        });

        it('default format when action is async function', async () => {
            const request = new Request({ resource: 'simple-js', action: 'retrieveAsync' });
            const response = await api.execute(request);
            expect(response.data.called).to.equal('retrieveAsync-default');
        });

        it('default format when action is object', async () => {
            const request = new Request({ resource: 'simple-js', action: 'formats' });
            const response = await api.execute(request);
            expect(response.data.called).to.equal('formats-default');
        });

        it('default format when format is "json"', async () => {
            const request = new Request({ resource: 'simple-js', action: 'formats', format: 'json' });
            const response = await api.execute(request);
            expect(response.data.called).to.equal('formats-default');
        });

        it('specific format when action is object', async () => {
            const request = new Request({ resource: 'simple-js', action: 'formats', format: 'image' });
            const response = await api.execute(request);
            expect(response.data.called).to.equal('formats-image');
        });

        it('should fail when action is function and format is not default', (done) => {
            const request = new Request({ resource: 'simple-js', format: 'unknown' });
            api.execute(request).catch((err) => {
                expect(err).to.be.an('error');
                expect(err.message).to.equal('Invalid format "unknown" for action "retrieve"');
                done();
            });
        });

        it('should fail when action is object and format is invalid', (done) => {
            const request = new Request({ resource: 'simple-js', action: 'formats', format: 'unknown' });
            api.execute(request).catch((err) => {
                expect(err).to.be.an('error');
                expect(err.message).to.equal('Invalid format "unknown" for action "formats"');
                done();
            });
        });
    });
});

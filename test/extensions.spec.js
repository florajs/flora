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
        process: (request, callback) => {
            callback(null, {
                data: [{
                    id: 1,
                    foo: 'bar'
                }, {
                    id: 2,
                    foo: 'baz'
                }],
                totalCount: null
            });
        },
        prepare: () => {}
    };
};

const testConfig = {
    log: log,
    resourcesPath: resourcesPath,
    dataSources: {
        empty: {
            constructor: testDataSource
        }
    }
};

describe('extensions', () => {
    describe('Api', () => {
        describe('init', () => {
            it('is emitted when the instance is initialized', (done) => {
                const api = new Api();

                api.on('init', () => {
                    api.close(done);
                });

                api.init({log: log});
            });

            it('can be called asynchronously', (done) => {
                const api = new Api();

                let initEmitted = false;
                api.on('init', (ev, next) => {
                    expect(next).to.be.a('function');
                    initEmitted = true;
                    next();
                });

                api.init({log: log}, () => {
                    expect(initEmitted).to.eql(true);
                    api.close(done);
                });
            });
        });

        describe('request', () => {
            it('is emitted when a request is made', (done) => {
                const api = new Api();

                api.init({log: log}, (err) => {
                    if (err) return done(err);

                    const request = new Request({resource: 'test'});
                    api.execute(request, () => {
                        api.close(done);
                    });
                });

                api.on('request', (ev) => {
                    expect(ev).to.be.an('object');
                    expect(ev.request).to.be.an('object');
                    expect(ev.request.resource).to.eql('test');
                });
            });

            it('can be called asynchronously', (done) => {
                const api = new Api();

                api.init({log: log}, (err) => {
                    if (err) return done(err);

                    const request = new Request({resource: 'test'});
                    api.execute(request, () => {
                        api.close(done);
                    });
                });

                api.on('request', (ev, next) => {
                    expect(ev).to.be.an('object');
                    expect(ev.request).to.be.an('object');
                    expect(ev.request.resource).to.eql('test');
                    expect(next).to.be.a('function');
                    next();
                });
            });
        });

        describe('response', () => {
            it('is emitted before a response is sent', (done) => {
                const api = new Api();

                api.init(testConfig, (err) => {
                    if (err) return done(err);

                    const request = new Request({resource: 'test'});
                    api.execute(request, (err2) => {
                        if (err2) return done(err2);
                        api.close(done);
                    });

                });

                api.on('response', (ev) => {
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');
                    expect(ev.response.data).to.be.an('array');
                });
            });

            it('can be called asynchronously', (done) => {
                const api = new Api();
                api.init(testConfig, (err) => {
                    if (err) return done(err);

                    const request = new Request({resource: 'test'});
                    api.execute(request, (err2, response) => {
                        if (err2) return done(err2);
                        expect(responseEmitted).to.eql(true);
                        api.close(done);
                    });
                });

                let responseEmitted = false;

                api.on('response', (ev, next) => {
                    responseEmitted = true;
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');
                    expect(ev.response.data).to.be.an('array');
                    expect(next).to.be.a('function');
                    next();
                });
            });
        });

        describe('close', () => {
            it('is emitted when the instance is closed', (done) => {
                const api = new Api();
                api.on('init', () => {
                    api.close();
                });

                api.on('close', done);

                api.init({log: log});
            });

            it('can be called asynchronously', (done) => {
                let closeCalled = false;

                const api = new Api();
                api.on('init', () => {
                    api.close(() => {
                        expect(closeCalled).to.eql(true);
                        done();
                    });
                });

                api.on('close', (ev, next) => {
                    expect(next).to.be.a('function');
                    closeCalled = true;
                    next();
                });

                api.init({log: log});
            });
        });
    });

    describe('resource', () => {
        describe('init (sync)', () => {
            it('is emitted once when the resource is called for the first time', (done) => {
                const api = new Api();

                api.init(testConfig, (err) => {
                    if (err) return done(err);
                    const resource = api.getResource('test');
                    expect(resource._initCalled()).to.equal(1);
                    api.close(done);
                });
            });

            it('is emitted only once', (done) => {
                const api = new Api();

                api.init(testConfig, (err) => {
                    if (err) return done(err);

                    const resource = api.getResource('test');

                    const request = new Request({resource: 'test'});
                    api.execute(request, (err2) => {
                        if (err2) return done(err2);

                        expect(resource._initCalled()).to.equal(1);
                        api.close(done);
                    });
                });
            });
        });

        describe('item', () => {
            it('is emitted when an item is handled', (done) => {
                const api = new Api();

                api.init(testConfig, (err) => {
                    if (err) return done(err);

                    const request = new Request({resource: 'test'});
                    api.execute(request, (err2) => {
                        if (err2) return done(err2);
                        api.close(done);
                    });
                });

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
            });
        });

        describe('preExecute', () => {
            it('is emitted with a dataSourceTree', (done) => {
                const api = new Api();

                api.init(testConfig, (err) => {
                    if (err) return done(err);

                    const request = new Request({resource: 'test'});
                    api.execute(request, (err2) => {
                        if (err2) return done(err2);
                        api.close(done);
                    });
                });

                api.on('response', (ev) => {
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');

                    // this is set by "preExecute" callback, see fixtures/extensions/test/index.js
                    expect(ev.request._preExecuteArgs).to.be.an('object');
                    expect(ev.request._preExecuteArgs.dataSourceTree).to.be.an('object');
                });
            });
        });

        describe('postExecute', () => {
            it('is emitted with rawResults', (done) => {
                const api = new Api();

                api.init(testConfig, (err) => {
                    if (err) return done(err);

                    const request = new Request({resource: 'test'});
                    api.execute(request, (err2) => {
                        if (err2) return done(err2);
                        api.close(done);
                    });
                });

                api.on('response', (ev) => {
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');

                    // this is set by "postExecute" callback, see fixtures/extensions/test/index.js
                    expect(ev.request._postExecuteArgs).to.be.an('object');
                    expect(ev.request._postExecuteArgs.rawResults).to.be.an('object');
                    expect(ev.request._postExecuteArgs.rawResults.data).to.be.an('array');
                });
            });
        });
    });
});

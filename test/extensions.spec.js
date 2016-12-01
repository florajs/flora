'use strict';

const path = require('path');

const chai = require('chai');
const bunyan = require('bunyan');
const sinon = require('sinon');

const { Api } = require('../');
const Request = require('../lib/request');

const expect = chai.expect;
chai.use(require('sinon-chai'));

const log = bunyan.createLogger({ name: 'null', streams: [] });
const resourcesPath = path.join(__dirname, 'fixtures', 'extensions', 'resources');

const testDataSource = function testDataSource() {
    return {
        process: function (request, callback) {
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
        prepare: function () {}
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

describe('extensions', function () {
    describe('Api', function () {
        describe('init', function() {
            it('is emitted when the instance is initialized', function (done) {
                var api = new Api();

                api.on('init', function () {
                    api.close(done);
                });

                api.init({log: log});
            });

            it('can be called asynchronously', function (done) {
                var api = new Api();

                var initEmitted = false;
                api.on('init', function (ev, next) {
                    expect(next).to.be.a('function');
                    initEmitted = true;
                    next();
                });

                api.init({log: log}, function () {
                    expect(initEmitted).to.eql(true);
                    api.close(done);
                });
            });
        });

        describe('request', function () {
            it('is emitted when a request is made', function (done) {
                var api = new Api();

                api.init({log: log}, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function () {
                        api.close(done);
                    });
                });

                api.on('request', function (ev) {
                    expect(ev).to.be.an('object');
                    expect(ev.request).to.be.an('object');
                    expect(ev.request.resource).to.eql('test');
                });
            });

            it('can be called asynchronously', function (done) {
                var api = new Api();

                api.init({log: log}, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function () {
                        api.close(done);
                    });
                });

                api.on('request', function (ev, next) {
                    expect(ev).to.be.an('object');
                    expect(ev.request).to.be.an('object');
                    expect(ev.request.resource).to.eql('test');
                    expect(next).to.be.a('function');
                    next();
                });
            });
        });

        describe('response', function () {
            it('is emitted before a response is sent', function (done) {
                var api = new Api();

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err2) {
                        if (err2) return done(err2);
                        api.close(done);
                    });

                });

                api.on('response', function (ev) {
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');
                    expect(ev.response.data).to.be.an('array');
                });
            });

            it('can be called asynchronously', function (done) {
                var api = new Api();
                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err2, response) {
                        if (err2) return done(err2);
                        expect(responseEmitted).to.eql(true);
                        api.close(done);
                    });
                });

                var responseEmitted = false;

                api.on('response', function (ev, next) {
                    responseEmitted = true;
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');
                    expect(ev.response.data).to.be.an('array');
                    expect(next).to.be.a('function');
                    next();
                });
            });
        });

        describe('close', function () {
            it('is emitted when the instance is closed', function (done) {
                var api = new Api();
                api.on('init', function () {
                    api.close();
                });

                api.on('close', done);

                api.init({log: log});
            });

            it('can be called asynchronously', function (done) {
                var closeCalled = false;

                var api = new Api();
                api.on('init', function () {
                    api.close(function () {
                        expect(closeCalled).to.eql(true);
                        done();
                    });
                });

                api.on('close', function (ev, next) {
                    expect(next).to.be.a('function');
                    closeCalled = true;
                    next();
                });

                api.init({log: log});
            });
        });
    });

    describe('resource', function () {
        describe('init (sync)', function () {
            it('is emitted once when the resource is called for the first time', function (done) {
                var api = new Api();

                api.init(testConfig, function (err) {
                    if (err) return done(err);
                    var resource = api.getResource('test');
                    expect(resource._initCalled()).to.equal(1);
                    api.close(done);
                });
            });

            it('is emitted only once', function (done) {
                var api = new Api();

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var resource = api.getResource('test');

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err2) {
                        if (err2) return done(err2);

                        expect(resource._initCalled()).to.equal(1);
                        api.close(done);
                    });
                });
            });
        });

        describe('item', function () {
            it('is emitted when an item is handled', function (done) {
                var api = new Api();

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err2) {
                        if (err2) return done(err2);
                        api.close(done);
                    });
                });

                api.on('response', function (ev) {
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

        describe('preExecute', function() {
            it('is emitted with a dataSourceTree', function (done) {
                var api = new Api();

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err2) {
                        if (err2) return done(err2);
                        api.close(done);
                    });
                });

                api.on('response', function (ev) {
                    expect(ev).to.be.an('object');
                    expect(ev.response).to.be.an('object');

                    // this is set by "preExecute" callback, see fixtures/extensions/test/index.js
                    expect(ev.request._preExecuteArgs).to.be.an('object');
                    expect(ev.request._preExecuteArgs.dataSourceTree).to.be.an('object');
                });
            });
        });

        describe('postExecute', function() {
            it('is emitted with rawResults', function (done) {
                var api = new Api();

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err2) {
                        if (err2) return done(err2);
                        api.close(done);
                    });
                });

                api.on('response', function (ev) {
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

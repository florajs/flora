'use strict';

var expect = require('chai').expect;
var path = require('path');
var bunyan = require('bunyan');
var Api = require('../').Api;
var Request = require('../lib/request');

var log = bunyan.createLogger({name: 'null', streams: []});
var resourcesPath = path.join(__dirname, 'fixtures', 'extensions', 'resources');

var testDataSource = function testDataSource() {
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

var testConfig = {
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
                api.on('init', function (dummy, next) {
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

                api.on('request', function (request) {
                    expect(request).to.be.an('object');
                    expect(request.resource).to.eql('test');
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

                api.on('request', function (request, next) {
                    expect(request).to.be.an('object');
                    expect(request.resource).to.eql('test');
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
                    api.execute(request, function (err) {
                        if (err) return done(err);
                        api.close(done);
                    });

                });

                api.on('response', function (response) {
                    expect(response).to.be.an('object');
                    expect(response.data).to.be.an('array');
                });
            });

            it('can be called asynchronously', function (done) {
                var api = new Api();
                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err, response) {
                        if (err) return done(err);
                        expect(responseEmitted).to.eql(true);
                        api.close(done);
                    });
                });

                var responseEmitted = false;

                api.on('response', function (response, next) {
                    responseEmitted = true;
                    expect(response).to.be.an('object');
                    expect(response.data).to.be.an('array');
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

                api.on('close', function (dummy, next) {
                    expect(next).to.be.a('function');
                    closeCalled = true;
                    next();
                });

                api.init({log: log});
            });
        });
    });

    describe('resource-processor', function () {
        describe('preExecute', function() {
            it('is emitted with a dataSourceTree', function (done) {
                var api = new Api();
                var emitted = false;

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err) {
                        if (err) return done(err);
                        expect(emitted).to.eql(true);
                        api.close(done);
                    });

                });

                api.on('preExecute', function (dataSourceTree) {
                    emitted = true;
                    expect(dataSourceTree).to.be.an('object');
                });
            });

            it('can be called asynchronously', function (done) {
                var api = new Api();
                var emitted = false;

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err) {
                        if (err) return done(err);
                        expect(emitted).to.eql(true);
                        api.close(done);
                    });
                });

                var responseEmitted = false;

                api.on('preExecute', function (dataSourceTree, next) {
                    emitted = true;
                    expect(dataSourceTree).to.be.an('object');
                    expect(next).to.be.a('function');
                    next();
                });
            });
        });

        describe('postExecute', function() {
            it('is emitted with rawResults', function (done) {
                var api = new Api();
                var emitted = false;

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err) {
                        if (err) return done(err);
                        expect(emitted).to.eql(true);
                        api.close(done);
                    });

                });

                api.on('postExecute', function (rawResults) {
                    emitted = true;
                    expect(rawResults).to.be.an('array');
                });
            });

            it('can be called asynchronously', function (done) {
                var api = new Api();
                var emitted = false;

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err) {
                        if (err) return done(err);
                        expect(emitted).to.eql(true);
                        api.close(done);
                    });
                });

                var responseEmitted = false;

                api.on('postExecute', function (rawResults, next) {
                    emitted = true;
                    expect(rawResults).to.be.an('array');
                    expect(next).to.be.a('function');
                    next();
                });
            });
        });
    });

    describe('resource', function () {
        describe('item', function () {
            it('is emitted when an item is handled', function (done) {
                var api = new Api();

                api.init(testConfig, function (err) {
                    if (err) return done(err);

                    var request = new Request({resource: 'test'});
                    api.execute(request, function (err) {
                        if (err) return done(err);
                        api.close(done);
                    });

                });

                api.on('response', function (response) {
                    expect(response).to.be.an('object');
                    expect(response.data).to.be.an('array');
                    expect(response.data.length).to.greaterThan(0);
                    expect(response.data[0]).to.eql({
                        id: 1,
                        bar: 'baz' // this is set by "item" callback, see fixtures/excensions/test/index.js
                    });
                });
            });
        });
    });
});

'use strict';

const path = require('path');
const { EventEmitter } = require('events');

const { expect } = require('chai');
const bunyan = require('bunyan');

const { Api } = require('../');
const Request = require('../lib/request');

const log = bunyan.createLogger({name: 'null', streams: []});
const resourcesPath = path.join(__dirname, 'fixtures', 'empty-resources');

const testDataSource = function testDataSource() {
    return {
        process: (request, callback) => {
            callback(null, {
                data: [],
                totalCount: null
            });
        },
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
        api.on('init', () => {
            done();
        });
        api.init({log: log});
    });

    it('should emit `close` when closed', (done) => {
        const api = new Api();
        api.on('init', () => {
            api.close();
        });
        api.on('close', () => {
            done();
        });
        api.init({log: log});
    });

    it('should return an error when closed without init', (done) => {
        const api = new Api();
        api.close((err) => {
            expect(err).to.be.an.instanceof(Error);
            expect(err.message).to.equal('Not running');
            done();
        });
    });

    it('should call the callback after close is called', (done) => {
        const api = new Api();
        api.init({log: log}, () => {
            api.close(done);
        });
    });

    it('should initialize even without a config object', (done) => {
        const api = new Api();
        api.init({resourcesPath: resourcesPath}, done);
    });

    it('should initialize a default logger', (done) => {
        const api = new Api();
        api.init({resourcesPath: resourcesPath}, () => {
            expect(api.log).to.be.an('object');
            done();
        });
    });

    it('should initialize dataSources', (done) => {
        const api = new Api();
        api.init({
            resourcesPath: resourcesPath,
            dataSources: {
                test: {
                    constructor: testDataSource
                }
            }
        }, (err) => {
            if (err) return done(err);
            done();
        });
    });

    it('should fail to initialize if dataSource lacks constructor', (done) => {
        const api = new Api();
        api.init({
            log: log,
            resourcesPath: resourcesPath,
            dataSources: {
                test: {
                    constructor: 'foo'
                }
            }
        }, (err) => {
            expect(err).to.be.an.instanceof(Error);
            done();
        });
    });

    it('should fail to initialize if dataSource is invalid', (done) => {
        const api = new Api();
        api.init({
            log: log,
            resourcesPath: resourcesPath,
            dataSources: {
                test: 'foo'
            }
        }, (err) => {
            expect(err).to.be.an.instanceof(Error);
            done();
        });
    });

    describe('plugins', () => {
        it('should allow to register plugins', () => {
            var plugin = {
                register: (master, options) => {
                    //done();
                }
            };

            const api = new Api();
            api.register(plugin);
        });

        it('should plugins registered before init', (done) => {
            var plugin = {
                register: (master, options) => {
                    done();
                }
            };

            const api = new Api();
            api.register(plugin);
            api.init({
                log: log,
                resourcesPath: resourcesPath
            }, (err) => {});
        });
    });

    describe('execute', () => {
        it('should fail when resource is unknown', (done) => {
            const api = new Api();
            api.init({
                log: log,
                resourcesPath: resourcesPath,
                dataSources: {
                    test: {
                        constructor: testDataSource
                    }
                }
            }, (err) => {
                if (err) return done(err);

                var request = new Request({
                    resource: 'foo'
                });
                api.execute(request, (err2, response) => {
                    expect(err2).to.be.an('object');
                    expect(err2.message).to.equal('Unknown resource "foo" in request');
                    api.close(done);
                });
            });
        });

        it('should fail when action does not exist', (done) => {
            const api = new Api();
            api.init({
                log: log,
                resourcesPath: resourcesPath,
                dataSources: {
                    test: {
                        constructor: testDataSource
                    }
                }
            }, (err) => {
                if (err) return done(err);

                // mock empty resource:
                api.resourceProcessor.resourceConfigs['no-actions'] = {
                    config: {},
                    instance: {}
                };

                var request = new Request({
                    resource: 'no-actions'
                });
                api.execute(request, (err2, response) => {
                    expect(err2).to.be.an('object');
                    expect(err2.message).to.equal('Action "retrieve" is not implemented');
                    api.close(done);
                });
            });
        });

        it('should fail when Api#init is not done', (done) => {
            const api = new Api();
            api.init({
                log: log,
                resourcesPath: resourcesPath,
                dataSources: {
                    test: {
                        constructor: testDataSource
                    }
                }
            }, () => {});

            var request = new Request({ resource: 'foo' });
            api.execute(request, (err, response) => {
                expect(response).to.be.undefined;
                expect(err).to.be.an('error');
                expect(err.message).to.equal('Not initialized');
                done();
            });
        });
    });
});

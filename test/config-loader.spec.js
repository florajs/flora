'use strict';

const chai = require('chai');
const fsMock = require('mock-fs');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const bunyan = require('bunyan');

const configLoader = require('../lib/config-loader');

const expect = chai.expect;
chai.use(sinonChai);

// mock Api instance
const api = {
    log: bunyan.createLogger({ name: 'null', streams: [] })
};

function parseXml(file, callback) { // fake parser for tests
    setTimeout(() => callback(null, 'xml config'), 1);
}

describe('config-loader', () => {
    it('should issue an error if config directory does not exist', (done) => {
        var directory = require('path').resolve('nonexistent-directory');

        configLoader(api, { directory }, (err) => {
            expect(err).to.be.instanceof(Error);
            expect(err.message).to.equal(`Config directory "${directory}" does not exist`);
            done();
        });
    });

    it('should read configs from directories', (done) => {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.xml': '' }
            }
        });

        var cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg, (err, configs) => {
            expect(configs).to.eql({
                resource1: {config: 'xml config'},
                resource2: {config: 'xml config'}
            });
            done();
        });
    });

    it('should call the callback only once', (done) => {
        fsMock({
            config: {
                resource1: { 'config.xml': '' }
            }
        });

        var cfg = {
            parsers: { xml: parseXml }
        };

        var callback = sinon.stub();
        callback.onFirstCall().returns(new Error());

        configLoader(api, cfg, callback);

        setTimeout(() => {
            expect(callback).to.has.been.calledOnce;
            done();
        }, 20);
    });

    it('should read configs recursively', (done) => {
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

        var cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg, (err, configs) => {
            expect(configs).to.eql({
                'groupfolder1/resource': {config: 'xml config'},
                'groupfolder2/groupfolder3/resource': {config: 'xml config'}
            });
            done();
        });
    });

    it('should strip path to config directory from resource', (done) => {
        fsMock({
            configs: {
                are: {
                    stored: {
                        'in': {
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

        var cfg = {
            directory: 'configs/are/stored/in/deep/directory/structure',
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg, (err, configs) => {
            expect(configs).to.eql({
                resource1: {config: 'xml config'},
                resource2: {config: 'xml config'}
            });
            done();
        });
    });

    it('should strip path also for relative paths', (done) => {
        fsMock({
            configs: {
                'relative-path': {
                    resource1: { 'config.xml': '' }
                }
            }
        });

        var cfg = {
            directory: 'configs/relative-path/../relative-path',
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg, (err, configs) => {
            expect(configs).to.eql({
                resource1: {config: 'xml config'}
            });
            done();
        });
    });

    it('should issue an error if no parser is found for a file extension extension', (done) => {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.json': '' }
            }
        });

        var cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg, (err) => {
            expect(err).to.be.instanceof(Error);
            expect(err.message).to.equal('No "json" config parser registered');
            done();
        });
    });

    it('should register additional loaders', (done) => {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.json': '' }
            }
        });

        var cfg = {
            parsers: {
                xml: parseXml,
                json: (file, callback) => {
                    setTimeout(() => {
                        callback(null, 'json config');
                    }, 1);
                }
            }
        };

        configLoader(api, cfg, (err, configs) => {
            expect(configs).to.eql({
                'resource1': {config: 'xml config'},
                'resource2': {config: 'json config'}
            });
            done();
        });
    });

    it('should ignore all other but config files', (done) => {
        fsMock({
            config: {
                groupfolder1: {
                    resource: {'config.xml': ''}
                },
                groupfolder2: {
                    groupfolder3: {
                        'readme.txt': '',
                        resource: {'config.xml': ''}
                    }
                },
                subDirectory3: { // omit in result
                    'file.doc': ''
                }
            }
        });

        var cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg, (err, configs) => {
            expect(configs).to.eql({
                'groupfolder1/resource': {config: 'xml config'},
                'groupfolder2/groupfolder3/resource': {config: 'xml config'}
            });
            done();
        });
    });

    it('should load our example resources (integration)', (done) => {
        var cfg = {
                directory: __dirname + '/fixtures/resources',
                parsers: { xml: require('../lib/xml-reader') }
            },
            resourcesLoaded = require(__dirname + '/fixtures/resources-loaded.json');

        configLoader(api, cfg, (err, configs) => {
            // for manually generating fixture:
            //console.log(JSON.stringify(configs, null, 4));

            try {
                expect(configs).to.eql(resourcesLoaded);
                done();
            } catch (e) {
                done(e);
            }
        });
    });

    afterEach(() => {
        fsMock.restore();   // restore original node.js fs module
    });
});

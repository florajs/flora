/* global describe, it, afterEach */

'use strict';

const chai = require('chai');
const fsMock = require('mock-fs');
// const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const nullLogger = require('abstract-logging');

const configLoader = require('../lib/config-loader');

const expect = chai.expect;
chai.use(sinonChai);

const log = nullLogger;
log.child = () => log;

// mock Api instance
const api = { log };

function parseXml(/* file */) {
    // fake parser for tests
    return Promise.resolve('xml config');
}

describe('config-loader', () => {
    it('should issue an error if config directory does not exist', (done) => {
        const directory = require('path').resolve('nonexistent-directory');

        configLoader(api, { directory }).catch((err) => {
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

        const cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg)
            .then((configs) => {
                expect(configs).to.eql({
                    resource1: { config: 'xml config' },
                    resource2: { config: 'xml config' }
                });
                done();
            })
            .catch(done);
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

        const cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg)
            .then((configs) => {
                expect(configs).to.eql({
                    'groupfolder1/resource': { config: 'xml config' },
                    'groupfolder2/groupfolder3/resource': { config: 'xml config' }
                });
                done();
            })
            .catch(done);
    });

    it('should strip path to config directory from resource', (done) => {
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

        configLoader(api, cfg)
            .then((configs) => {
                expect(configs).to.eql({
                    resource1: { config: 'xml config' },
                    resource2: { config: 'xml config' }
                });
                done();
            })
            .catch(done);
    });

    it('should strip path also for relative paths', (done) => {
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

        configLoader(api, cfg)
            .then((configs) => {
                expect(configs).to.eql({
                    resource1: { config: 'xml config' }
                });
                done();
            })
            .catch(done);
    });

    it('should issue an error if no parser is found for a file extension extension', (done) => {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.json': '' }
            }
        });

        const cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(api, cfg).catch((err) => {
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

        const cfg = {
            parsers: {
                xml: parseXml,
                json: () => Promise.resolve('json config')
            }
        };

        configLoader(api, cfg)
            .then((configs) => {
                expect(configs).to.eql({
                    resource1: { config: 'xml config' },
                    resource2: { config: 'json config' }
                });
                done();
            })
            .catch(done);
    });

    it('should ignore all other but config files', (done) => {
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

        configLoader(api, cfg)
            .then((configs) => {
                expect(configs).to.eql({
                    'groupfolder1/resource': { config: 'xml config' },
                    'groupfolder2/groupfolder3/resource': { config: 'xml config' }
                });
                done();
            })
            .catch(done);
    });

    it('should load our example resources (integration)', (done) => {
        const cfg = {
                directory: __dirname + '/fixtures/resources',
                parsers: { xml: require('../lib/xml-reader') }
            },
            resourcesLoaded = require(__dirname + '/fixtures/resources-loaded.json');

        configLoader(api, cfg)
            .then((configs) => {
                // for manually generating fixture:
                //console.log(JSON.stringify(configs, null, 4));

                try {
                    expect(configs).to.eql(resourcesLoaded);
                    done();
                } catch (e) {
                    done(e);
                }
            })
            .catch(done);
    });

    afterEach(() => {
        fsMock.restore(); // restore original node.js fs module
    });
});

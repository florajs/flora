'use strict';

var chai = require('chai'),
    expect = chai.expect,
    configLoader = require('../lib/config-loader'),
    fsMock = require('mock-fs');

function parseXml(file, callback) { // fake parser for tests
    setTimeout(function () {
        callback(null, 'xml config');
    }, 1);
}

describe('config-loader', function () {
    it('should issue an error if config directory does not exist', function (done) {
        var directory = require('path').resolve('nonexistent-directory');

        configLoader({ directory: directory }, function (err) {
            expect(err).to.be.instanceof(Error);
            expect(err.message).to.equal('Config directory "' + directory + '" does not exist');
            done();
        });
    });

    it('should read configs from directories', function (done) {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.xml': '' }
            }
        });

        var cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(cfg, function (err, configs) {
            expect(configs).to.eql({
                resource1: 'xml config',
                resource2: 'xml config'
            });
            done();
        });
    });

    it('should read configs recursively', function (done) {
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

        configLoader(cfg, function (err, configs) {
            expect(configs).to.eql({
                'groupfolder1/resource': 'xml config',
                'groupfolder2/groupfolder3/resource': 'xml config'
            });
            done();
        });
    });

    it('should strip path to config directory from resource', function (done) {
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

        configLoader(cfg, function (err, configs) {
            expect(configs).to.eql({
                resource1: 'xml config',
                resource2: 'xml config'
            });
            done();
        });
    });

    it('should strip path also for relative paths', function (done) {
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

        configLoader(cfg, function (err, configs) {
            expect(configs).to.eql({
                resource1: 'xml config'
            });
            done();
        });
    });

    it('should issue an error if no parser is found for a file extension extension', function (done) {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.json': '' }
            }
        });

        var cfg = {
            parsers: { xml: parseXml }
        };

        configLoader(cfg, function (err) {
            expect(err).to.be.instanceof(Error);
            expect(err.message).to.equal('No "json" config parser registered');
            done();
        });
    });

    it('should register additional loaders', function (done) {
        fsMock({
            config: {
                resource1: { 'config.xml': '' },
                resource2: { 'config.json': '' }
            }
        });

        var cfg = {
            parsers: {
                xml: parseXml,
                json: function (file, callback) {
                    setTimeout(function () {
                        callback(null, 'json config');
                    }, 1);
                }
            }
        };

        configLoader(cfg, function (err, configs) {
            expect(configs).to.eql({
                'resource1': 'xml config',
                'resource2': 'json config'
            });
            done();
        });
    });

    it('should ignore all other but config files', function (done) {
        fsMock({
            config: {
                groupfolder1: {
                    resource: {
                        'config.xml': '',
                        'index.js': ''
                    }
                },
                groupfolder2: {
                    groupfolder3: {
                        'readme.txt': '',
                        resource: {
                            'config.xml': '',
                            'index.js': ''
                        }
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

        configLoader(cfg, function (err, configs) {
            expect(configs).to.eql({
                'groupfolder1/resource': 'xml config',
                'groupfolder2/groupfolder3/resource': 'xml config'
            });
            done();
        });
    });

    afterEach(function () {
        fsMock.restore();   // restore original node.js fs module
    });
});

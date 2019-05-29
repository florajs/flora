/* global describe, it */

'use strict';

const { expect } = require('chai');

const xmlReader = require('../lib/xml-reader');

describe('xml-reader', () => {
    describe('DataSources', () => {
        it('should parse simple database data source without query', done => {
            xmlReader(__dirname + '/fixtures/xml-reader/datasource-simple.xml')
                .then(config => {
                    expect(config.dataSources).to.deep.equal({
                        primary: {
                            type: 'mysql',
                            database: 'db',
                            table: 'country'
                        }
                    });
                    done();
                })
                .catch(done);
        });

        it('should parse database data source with SQL query', done => {
            xmlReader(__dirname + '/fixtures/xml-reader/datasource-custom-query.xml')
                .then(config => {
                    expect(config.dataSources).to.eql({
                        primary: {
                            type: 'mysql',
                            database: 'db',
                            query: "SELECT * FROM foo WHERE field = 'bar'"
                        }
                    });
                    done();
                })
                .catch(done);
        });

        it('should parse join attributes', done => {
            xmlReader(__dirname + '/fixtures/xml-reader/datasource-join-attributes.xml')
                .then(config => {
                    expect(config.attributes['sub-resource'].dataSources).to.eql({
                        primary: {
                            type: 'mysql',
                            database: 'db',
                            table: 'some_table',
                            parentKey: '{primary}',
                            childKey: '{primary}',
                            joinVia: 'some_relation_table',
                            many: 'true'
                        }
                    });
                    done();
                })
                .catch(done);
        });

        it('should throw an error on option w/o name attribute', done => {
            xmlReader(__dirname + '/fixtures/xml-reader/datasource-option-without-name-attr.xml').catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.have.string('flora:option element requires a name attribute');
                done();
            });
        });

        it('should throw an error on duplicate option names', done => {
            xmlReader(__dirname + '/fixtures/xml-reader/datasource-duplicate-option.xml').catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.have.string('Data source option "query" already defined');
                done();
            });
        });

        it('should throw an error on duplicate data source names', done => {
            xmlReader(__dirname + '/fixtures/xml-reader/datasource-duplicates.xml').catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.have.string('Data source "primary" already defined');
                done();
            });
        });

        it('should throw an error if datasource node contains text nodes', done => {
            xmlReader(__dirname + '/fixtures/xml-reader/invalid-datasource-text-node.xml').catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.contains('dataSource contains useless text');
                done();
            });
        });

        it('should throw an if xml contains invalid text nodes', done => {
            xmlReader(__dirname + '/fixtures/xml-reader/invalid-text-node.xml').catch(err => {
                try {
                    expect(err).to.be.instanceof(Error);
                    expect(err.message).to.contains('Config contains unnecessary text');
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });

    it('should parse primary keys', done => {
        xmlReader(__dirname + '/fixtures/xml-reader/primary-keys.xml')
            .then(config => {
                expect(config).to.eql({
                    primaryKey: 'pk_id',
                    attributes: {
                        subresource1: {
                            primaryKey: 'id',
                            dataSources: {
                                primary: { type: 'mysql', database: 'db', table: 'table' }
                            },
                            attributes: { name: {} }
                        }
                    }
                });
                done();
            })
            .catch(done);
    });

    it('should parse attributes', done => {
        xmlReader(__dirname + '/fixtures/xml-reader/attributes.xml')
            .then(config => {
                expect(config).to.eql({
                    attributes: {
                        someAttribute: { type: 'integer' },
                        someOtherAttribute: { order: 'true' },
                        someBooleanAttribute: { type: 'boolean', map: 'weirdField' },
                        group: {
                            attributes: {
                                subAttribute1: { filter: 'equals' },
                                subAttribute2: {}
                            }
                        }
                    }
                });
                done();
            })
            .catch(done);
    });

    it('should not parse namespaced nodes (i.e. flora:xxx) as attributes', done => {
        xmlReader(__dirname + '/fixtures/xml-reader/subfilter.xml')
            .then(config => {
                expect(config).to.eql({
                    attributes: {
                        'sub-resource': {
                            type: 'resource',
                            resource: 'some-resource',
                            subFilters: [{ attribute: 'otherAttribute', filter: 'equal' }]
                        }
                    },
                    subFilters: [{ attribute: 'someAttribute', filter: 'equal' }]
                });
                done();
            })
            .catch(done);
    });

    it('should parse sub-resources (with all options)', done => {
        xmlReader(__dirname + '/fixtures/xml-reader/subresource.xml')
            .then(config => {
                expect(config).to.eql({
                    attributes: {
                        subresource1: { type: 'resource', resource: 'otherresource' },
                        attr: {},
                        subresource2: {
                            primaryKey: 'id',
                            parentKey: '{primary}',
                            childKey: '{primary}',
                            dataSources: {
                                primary: {
                                    type: 'mysql',
                                    database: 'db',
                                    table: 'table'
                                }
                            },
                            attributes: {
                                id: { type: 'integer' },
                                name: {}
                            }
                        }
                    }
                });
                done();
            })
            .catch(done);
    });

    it('should preserve order for attributes and sub-resources', done => {
        xmlReader(__dirname + '/fixtures/xml-reader/subresource.xml')
            .then(config => {
                const keys = Object.keys(config.attributes);
                expect(keys[0]).to.equal('subresource1');
                expect(keys[1]).to.equal('attr');
                expect(keys[2]).to.equal('subresource2');
                done();
            })
            .catch(done);
    });

    it('should generate an error if XML cannot be parsed', done => {
        xmlReader(__dirname + '/fixtures/xml-reader/broken.xml').catch(err => {
            expect(err).to.be.instanceof(Error);
            done();
        });
    });

    it('should generate an error if XML contains nodes with same name', done => {
        xmlReader(__dirname + '/fixtures/xml-reader/duplicate-node.xml').catch(err => {
            expect(err)
                .to.be.instanceof(Error)
                .and.has.property('message', 'Resource already contains an attribute with name "node"');
            done();
        });
    });

    it('should parse flora specific elements by uri namespace (instead of prefix)', done => {
        xmlReader(__dirname + '/fixtures/xml-reader/namespace-uri.xml')
            .then(config => {
                expect(config).to.eql({
                    dataSources: {
                        primary: {
                            type: 'mysql',
                            database: 'db',
                            table: 't'
                        }
                    }
                });
                done();
            })
            .catch(done);
    });
});

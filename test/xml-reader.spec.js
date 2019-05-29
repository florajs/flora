/* global describe, it */

'use strict';

const { expect } = require('chai');

const xmlReader = require('../lib/xml-reader');

describe('xml-reader', () => {
    describe('DataSources', () => {
        it('should parse simple database data source without query', async () => {
            const { dataSources } = await xmlReader(__dirname + '/fixtures/xml-reader/datasource-simple.xml');

            expect(dataSources).to.eql({
                primary: {
                    type: 'mysql',
                    database: 'db',
                    table: 'country'
                }
            });
        });

        it('should parse database data source with SQL query', async () => {
            const { dataSources } = await xmlReader(__dirname + '/fixtures/xml-reader/datasource-custom-query.xml');

            expect(dataSources).to.eql({
                primary: {
                    type: 'mysql',
                    database: 'db',
                    query: "SELECT * FROM foo WHERE field = 'bar'"
                }
            });
        });

        it('should parse join attributes', async () => {
            const { attributes } = await xmlReader(__dirname + '/fixtures/xml-reader/datasource-join-attributes.xml');

            expect(attributes['sub-resource'].dataSources).to.eql({
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
        });

        it('should throw an error on option w/o name attribute', async () => {
            try {
                await xmlReader(__dirname + '/fixtures/xml-reader/datasource-option-without-name-attr.xml');
            } catch (err) {
                expect(err)
                    .to.be.instanceof(Error)
                    .and.to.have.property('message', 'flora:option element requires a name attribute');
                return;
            }

            throw new Error('Expected an error');
        });

        it('should throw an error on duplicate option names', async () => {
            try {
                await xmlReader(__dirname + '/fixtures/xml-reader/datasource-duplicate-option.xml');
            } catch (err) {
                expect(err)
                    .to.be.instanceof(Error)
                    .and.to.have.property('message', 'Data source option "query" already defined');
                return;
            }

            throw new Error('Expected an error');
        });

        it('should throw an error on duplicate data source names', async () => {
            try {
                await xmlReader(__dirname + '/fixtures/xml-reader/datasource-duplicates.xml');
            } catch (err) {
                expect(err)
                    .to.be.instanceof(Error)
                    .and.to.have.property('message', 'Data source "primary" already defined');
                return;
            }

            throw new Error('Expected an error');
        });

        it('should throw an error if datasource node contains text nodes', async () => {
            try {
                await xmlReader(__dirname + '/fixtures/xml-reader/invalid-datasource-text-node.xml');
            } catch (err) {
                expect(err)
                    .to.be.instanceof(Error)
                    .and.to.have.property('message')
                    .contains('dataSource contains useless text');
                return;
            }

            throw new Error('Expected an error');
        });

        it('should throw an if xml contains invalid text nodes', async () => {
            try {
                await xmlReader(__dirname + '/fixtures/xml-reader/invalid-text-node.xml');
            } catch (err) {
                expect(err)
                    .to.be.instanceof(Error)
                    .to.have.property('message')
                    .contains('Config contains unnecessary text');
                return;
            }

            throw new Error('Expected an error');
        });
    });

    it('should parse primary keys', async () => {
        const config = await xmlReader(__dirname + '/fixtures/xml-reader/primary-keys.xml');

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
    });

    it('should parse attributes', async () => {
        const config = await xmlReader(__dirname + '/fixtures/xml-reader/attributes.xml');

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
    });

    it('should not parse namespaced nodes (i.e. flora:xxx) as attributes', async () => {
        const config = await xmlReader(__dirname + '/fixtures/xml-reader/subfilter.xml');

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
    });

    it('should parse sub-resources (with all options)', async () => {
        const config = await xmlReader(__dirname + '/fixtures/xml-reader/subresource.xml');

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
    });

    it('should preserve order for attributes and sub-resources', async () => {
        const { attributes } = await xmlReader(__dirname + '/fixtures/xml-reader/subresource.xml');
        const keys = Object.keys(attributes);

        expect(keys).to.eql(['subresource1', 'attr', 'subresource2']);
    });

    it('should generate an error if XML cannot be parsed', async () => {
        try {
            await xmlReader(__dirname + '/fixtures/xml-reader/broken.xml');
        } catch (err) {
            expect(err).to.be.instanceof(Error);
            return;
        }

        throw new Error('Expected an error');
    });

    it('should generate an error if XML contains nodes with same name', async () => {
        try {
            await xmlReader(__dirname + '/fixtures/xml-reader/duplicate-node.xml');
        } catch (err) {
            expect(err)
                .to.be.instanceof(Error)
                .and.has.property('message', 'Resource already contains an attribute with name "node"');
            return;
        }

        throw new Error('Expected an error');
    });

    it('should parse flora specific elements by uri namespace (instead of prefix)', async () => {
        const config = await xmlReader(__dirname + '/fixtures/xml-reader/namespace-uri.xml');

        expect(config).to.eql({
            dataSources: {
                primary: {
                    type: 'mysql',
                    database: 'db',
                    table: 't'
                }
            }
        });
    });
});

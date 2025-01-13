'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const xmlReader = require('../lib/xml-reader');

describe('xml-reader', () => {
    describe('DataSources', () => {
        it('should parse simple database data source without query', async () => {
            const { dataSources } = await xmlReader(__dirname + '/fixtures/xml-reader/datasource-simple.xml');

            assert.deepEqual(dataSources, {
                primary: {
                    type: 'mysql',
                    database: 'db',
                    table: 'country'
                }
            });
        });

        it('should parse database data source with SQL query', async () => {
            const { dataSources } = await xmlReader(__dirname + '/fixtures/xml-reader/datasource-custom-query.xml');

            assert.deepEqual(dataSources, {
                primary: {
                    type: 'mysql',
                    database: 'db',
                    query: "SELECT * FROM foo WHERE field = 'bar'"
                }
            });
        });

        it('should parse join attributes', async () => {
            const { attributes } = await xmlReader(__dirname + '/fixtures/xml-reader/datasource-join-attributes.xml');

            assert.deepEqual(attributes['sub-resource'].dataSources, {
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
            await assert.rejects(
                xmlReader(__dirname + '/fixtures/xml-reader/datasource-option-without-name-attr.xml'),
                new Error('flora:option element requires a name attribute')
            );
        });

        it('should throw an error on duplicate option names', async () => {
            await assert.rejects(
                xmlReader(__dirname + '/fixtures/xml-reader/datasource-duplicate-option.xml'),
                new Error('Data source option "query" already defined')
            );
        });

        it('should throw an error on duplicate data source names', async () => {
            await assert.rejects(
                xmlReader(__dirname + '/fixtures/xml-reader/datasource-duplicates.xml'),
                new Error('Data source "primary" already defined')
            );
        });

        it('should throw an error if datasource node contains text nodes', async () => {
            await assert.rejects(xmlReader(__dirname + '/fixtures/xml-reader/invalid-datasource-text-node.xml'), {
                message: 'dataSource contains useless text: "abc"'
            });
        });

        it('should throw an error if xml contains invalid text nodes', async () => {
            await assert.rejects(xmlReader(__dirname + '/fixtures/xml-reader/invalid-text-node.xml'), {
                message: 'Config contains unnecessary text: "abc"'
            });
        });
    });

    it('should parse primary keys', async () => {
        const config = await xmlReader(__dirname + '/fixtures/xml-reader/primary-keys.xml');

        assert.deepEqual(config, {
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

        assert.deepEqual(config, {
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

        assert.deepEqual(config, {
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

        assert.deepEqual(config, {
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

        assert.deepEqual(keys, ['subresource1', 'attr', 'subresource2']);
    });

    it('should generate an error if XML cannot be parsed', async () => {
        await assert.rejects(xmlReader(__dirname + '/fixtures/xml-reader/broken.xml'), Error);
    });

    it('should generate an error if XML contains nodes with same name', async () => {
        await assert.rejects(xmlReader(__dirname + '/fixtures/xml-reader/duplicate-node.xml'), {
            message: 'Duplicate attribute "node"'
        });
    });

    it('should parse flora specific elements by uri namespace (instead of prefix)', async () => {
        const config = await xmlReader(__dirname + '/fixtures/xml-reader/namespace-uri.xml');

        assert.deepEqual(config, {
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

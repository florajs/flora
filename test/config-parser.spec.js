'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ImplementationError } = require('@florajs/errors');

const configParser = require('../lib/config-parser');

const mockDataSource = {
    prepare: (rawRequest, attributes) => {
        if (!rawRequest.expectedAttributes) {
            throw new Error('Mocked DataSource: Please set expectedAttributes for all DataSources in your test');
        }

        assert.deepEqual(attributes, rawRequest.expectedAttributes);

        delete rawRequest.expectedAttributes;
    },
    process: async () => {}
};

const mockDataSources = {
    testDataSource: mockDataSource,
    mysql: mockDataSource,
    solr: mockDataSource
};

const minimalResourceConfigs = {
    test: {
        config: {
            primaryKey: 'id',
            dataSources: {
                primary: {
                    type: 'testDataSource',
                    expectedAttributes: ['id']
                }
            },
            attributes: {
                id: {
                    type: 'int'
                }
            }
        }
    }
};

const minimalResourceConfigsParsed = {
    test: {
        config: {
            primaryKey: [['id']],
            resolvedPrimaryKey: {
                primary: ['id']
            },
            dataSources: {
                primary: {
                    type: 'testDataSource'
                }
            },
            attributes: {
                id: {
                    type: 'int',
                    map: {
                        default: {
                            primary: 'id'
                        }
                    },
                    filter: ['equal']
                }
            }
        }
    }
};

describe('config-parser', () => {
    describe('basic config parsing', () => {
        it('parses minimal resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('parses minimal "symlink"-resource', () => {
            const resourceConfigs = {
                test: {
                    config: { resource: 'test2' }
                },
                test2: structuredClone(minimalResourceConfigs['test'])
            };
            const resourceConfigsParsed = {
                test: {
                    config: { resource: 'test2' }
                },
                test2: structuredClone(minimalResourceConfigsParsed['test'])
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails on unknown "symlink"-resource', () => {
            const resourceConfigs = {
                test: {
                    config: { resource: 'test2' }
                }
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Unknown resource "test2" in resource "test:{root}"')
            );
        });
    });

    describe('options in resource-context', () => {
        it('fails on invalid options in resource-context', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.type = 'int';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Invalid option "type" in resource "test:{root}"')
            );
        });

        it('fails on unknown sub-resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = { resource: 'unknown' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Unknown resource "unknown" in sub-resource "test:subResource"')
            );
        });

        it('fails on DataSources without "type" option', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.dataSources['articleBody'] = {};

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('DataSource "articleBody" misses "type" option in resource "test:{root}"')
            );
        });

        it('parses DataSources with "inherit" option', () => {
            const resourceConfigs = {
                test: {
                    config: {
                        resource: 'test',
                        dataSources: {
                            primary: {
                                inherit: 'true'
                            }
                        }
                    }
                }
            };

            const resourceConfigsParsed = {
                test: {
                    config: {
                        resource: 'test',
                        dataSources: {
                            primary: {
                                inherit: 'inherit'
                            }
                        }
                    }
                }
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails on DataSources with "inherit" option but without included resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.dataSources['primary'] = { inherit: 'true' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('DataSource "primary" is defined as "inherit" but has no included resource')
            );
        });

        it('parses DataSources with "replace" option', () => {
            const resourceConfigs = {
                test: {
                    config: {
                        resource: 'test',
                        dataSources: {
                            primary: {
                                type: 'testDataSource',
                                expectedAttributes: ['id'],
                                inherit: 'replace'
                            }
                        },
                        attributes: {
                            id: {
                                type: 'int'
                            }
                        }
                    }
                }
            };

            const resourceConfigsParsed = {
                test: {
                    config: {
                        attributes: {
                            id: {
                                map: {
                                    default: {
                                        primary: 'id'
                                    }
                                },
                                type: 'int'
                            }
                        },
                        resource: 'test',
                        dataSources: {
                            primary: {
                                type: 'testDataSource',
                                inherit: 'replace'
                            }
                        }
                    }
                }
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails on DataSources with "replace" option but without included resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.dataSources['primary'] = { inherit: 'replace' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('DataSource "primary" is defined as "inherit" but has no included resource')
            );
        });

        it('fails on unknown DataSource types', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.dataSources['primary'] = { type: 'unknown' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Invalid DataSource type "unknown" in resource "test:{root}"')
            );
        });

        it('parses subFilters and its options', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.subFilters = [
                {
                    attribute: 'author.groupId',
                    filter: 'true',
                    rewriteTo: 'authorGroupId'
                }
            ];

            resourceConfigsParsed['test'].config.subFilters = [
                {
                    attribute: ['author', 'groupId'],
                    filter: ['equal'],
                    rewriteTo: ['authorGroupId']
                }
            ];

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails if subFilters defined for included sub-resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = {
                resource: 'test',
                subFilters: []
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Adding subFilters for included sub-resource is not allowed in sub-resource "test:subResource"'
                )
            );
        });

        it('fails on syntactically invalid option "resource"', () => {
            const resourceConfigs = {
                test: {
                    config: { resource: '!test' }
                }
            };

            assert.throws(() => configParser(resourceConfigs, mockDataSources), {
                name: 'ImplementationError',
                message: 'Invalid resource name "!test" (option "resource" in resource "test:{root}")'
            });
        });

        it('allows sub-resources with "/"', () => {
            const resourceConfigs = {
                test: {
                    config: { resource: 'test/subresource' }
                },
                'test/subresource': {
                    config: { resource: 'test/subresource' }
                }
            };

            assert.doesNotThrow(() => configParser(resourceConfigs, mockDataSources), ImplementationError);
            assert.equal(resourceConfigs['test'].config.resource, 'test/subresource');
        });

        it('parses and resolves composite primaryKey', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.primaryKey = 'id,context';
            resourceConfigs['test'].config.attributes['context'] = { map: 'ctx' };
            resourceConfigs['test'].config.dataSources['primary'].expectedAttributes = ['id', 'ctx'];

            resourceConfigsParsed['test'].config.primaryKey = [['id'], ['context']];
            resourceConfigsParsed['test'].config.resolvedPrimaryKey = { primary: ['id', 'ctx'] };
            resourceConfigsParsed['test'].config.attributes['context'] = {
                type: 'string',
                map: {
                    default: {
                        primary: 'ctx'
                    }
                }
            };

            // no default filter for composite keys:
            delete resourceConfigsParsed['test'].config.attributes['id'].filter;

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('does not set default filter on hidden primaryKey', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['id'].hidden = 'true';
            resourceConfigsParsed['test'].config.attributes['id'].hidden = true;
            delete resourceConfigsParsed['test'].config.attributes['id'].filter;

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('parses and resolves primaryKey in nested attributes', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.primaryKey = 'meta.id';
            resourceConfigs['test'].config.attributes['meta'] = {
                attributes: { id: resourceConfigs['test'].config.attributes['id'] }
            };
            resourceConfigs['test'].config.attributes['meta'].attributes['id'].map = 'id';
            delete resourceConfigs['test'].config.attributes['id'];

            resourceConfigsParsed['test'].config.primaryKey = [['meta', 'id']];
            resourceConfigsParsed['test'].config.resolvedPrimaryKey = { primary: ['id'] };
            resourceConfigsParsed['test'].config.attributes['meta'] = {
                attributes: { id: resourceConfigsParsed['test'].config.attributes['id'] }
            };
            delete resourceConfigsParsed['test'].config.attributes['id'];

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails on missing primaryKey', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            delete resourceConfigs['test'].config.primaryKey;

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Missing primaryKey in resource "test:{root}"')
            );
        });

        it('fails on missing primaryKey in inline-sub-resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            delete resourceConfigs['test'].config.attributes['subResource'].primaryKey;
            resourceConfigs['test'].config.attributes['subResource'].parentKey = '{primary}';
            resourceConfigs['test'].config.attributes['subResource'].childKey = '{primary}';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Missing primaryKey in sub-resource "test:subResource"')
            );
        });

        it('fails if primaryKey references unknown attributes', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.primaryKey = 'unknownId';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Unknown attribute "unknownId" in primaryKey in resource "test:{root}"')
            );
        });

        it('fails if primaryKey references attribute in sub-resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.primaryKey = 'subResource.id';
            resourceConfigs['test'].config.attributes['subResource'] = { resource: 'test' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Path "subResource.id" references sub-resource in primaryKey in resource "test:{root}"'
                )
            );
        });

        it('fails if primaryKey references multiValued attribute', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['id'].multiValued = 'true';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Key attribute "id" must not be multiValued in primaryKey in resource "test:{root}"'
                )
            );
        });

        it('fails if primaryKey references static ("value") attribute', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['id'] = { value: 'static' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Key attribute "id" is not mapped to "primary" DataSource in primaryKey in resource "test:{root}"'
                )
            );
        });

        it('fails if primaryKey is overwritten for included sub-resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = {
                resource: 'test',
                primaryKey: 'id'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Overwriting primaryKey for included sub-resource is not allowed in sub-resource "test:subResource"'
                )
            );
        });

        it('fails if primaryKey is not mapped to all DataSources', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.primaryKey = 'id,context';
            resourceConfigs['test'].config.dataSources['secondary'] = { type: 'testDataSource' };
            resourceConfigs['test'].config.attributes['id'] = { map: 'id;secondary:id' };
            resourceConfigs['test'].config.attributes['context'] = { map: 'ctx' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Key attribute "context" is not mapped to "secondary" DataSource in primaryKey in resource "test:{root}"'
                )
            );
        });

        it('parses and resolves parentKey/childKey', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['parentId'] = { type: 'int', map: 'parentIdDbField' };
            resourceConfigs['test'].config.dataSources['primary'].expectedAttributes = ['id', 'parentIdDbField'];
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'parentId';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'childId';
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'childIdDbField'
            };
            resourceConfigs['test'].config.attributes['subResource'].dataSources['primary'].expectedAttributes = [
                'id',
                'childIdDbField'
            ];

            resourceConfigsParsed['test'].config.attributes['parentId'] = {
                type: 'int',
                map: { default: { primary: 'parentIdDbField' } }
            };
            resourceConfigsParsed['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigsParsed['test'].config
            );
            resourceConfigsParsed['test'].config.attributes['subResource'].parentKey = [['parentId']];
            resourceConfigsParsed['test'].config.attributes['subResource'].resolvedParentKey = {
                primary: ['parentIdDbField']
            };
            resourceConfigsParsed['test'].config.attributes['subResource'].childKey = [['childId']];
            resourceConfigsParsed['test'].config.attributes['subResource'].resolvedChildKey = {
                primary: ['childIdDbField']
            };
            resourceConfigsParsed['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: { default: { primary: 'childIdDbField' } }
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('parses and resolves composite parentKey/childKey', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['parentId'] = { type: 'int', map: 'parentIdDbField' };
            resourceConfigs['test'].config.attributes['context'] = { type: 'int', map: 'contextDbField' };
            resourceConfigs['test'].config.dataSources['primary'].expectedAttributes = [
                'id',
                'parentIdDbField',
                'contextDbField'
            ];
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'parentId,context';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'childId,context';
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'childIdDbField'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['context'] = {
                type: 'int',
                map: 'contextDbField'
            };
            resourceConfigs['test'].config.attributes['subResource'].dataSources['primary'].expectedAttributes = [
                'id',
                'childIdDbField',
                'contextDbField'
            ];

            resourceConfigsParsed['test'].config.attributes['parentId'] = {
                type: 'int',
                map: { default: { primary: 'parentIdDbField' } }
            };
            resourceConfigsParsed['test'].config.attributes['context'] = {
                type: 'int',
                map: { default: { primary: 'contextDbField' } }
            };
            resourceConfigsParsed['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigsParsed['test'].config
            );
            resourceConfigsParsed['test'].config.attributes['subResource'].parentKey = [['parentId'], ['context']];
            resourceConfigsParsed['test'].config.attributes['subResource'].resolvedParentKey = {
                primary: ['parentIdDbField', 'contextDbField']
            };
            resourceConfigsParsed['test'].config.attributes['subResource'].childKey = [['childId'], ['context']];
            resourceConfigsParsed['test'].config.attributes['subResource'].resolvedChildKey = {
                primary: ['childIdDbField', 'contextDbField']
            };
            resourceConfigsParsed['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: { default: { primary: 'childIdDbField' } }
            };
            resourceConfigsParsed['test'].config.attributes['subResource'].attributes['context'] = {
                type: 'int',
                map: { default: { primary: 'contextDbField' } }
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('parses and resolves parentKey/childKey in nested attributes', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['meta'] = { attributes: {} };
            resourceConfigs['test'].config.attributes['meta'].attributes['parentId'] = { type: 'int', map: 'parentId' };
            resourceConfigs['test'].config.dataSources['primary'].expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'meta.parentId';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'meta.childId';
            resourceConfigs['test'].config.attributes['subResource'].attributes['meta'] = { attributes: {} };
            resourceConfigs['test'].config.attributes['subResource'].attributes['meta'].attributes['childId'] = {
                type: 'int',
                map: 'childId'
            };
            resourceConfigs['test'].config.attributes['subResource'].dataSources['primary'].expectedAttributes = [
                'id',
                'childId'
            ];

            resourceConfigsParsed['test'].config.attributes['meta'] = { attributes: {} };
            resourceConfigsParsed['test'].config.attributes['meta'].attributes['parentId'] = {
                type: 'int',
                map: { default: { primary: 'parentId' } }
            };
            resourceConfigsParsed['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigsParsed['test'].config
            );
            resourceConfigsParsed['test'].config.attributes['subResource'].parentKey = [['meta', 'parentId']];
            resourceConfigsParsed['test'].config.attributes['subResource'].resolvedParentKey = {
                primary: ['parentId']
            };
            resourceConfigsParsed['test'].config.attributes['subResource'].childKey = [['meta', 'childId']];
            resourceConfigsParsed['test'].config.attributes['subResource'].resolvedChildKey = { primary: ['childId'] };
            resourceConfigsParsed['test'].config.attributes['subResource'].attributes['meta'] = { attributes: {} };
            resourceConfigsParsed['test'].config.attributes['subResource'].attributes['meta'].attributes['childId'] = {
                type: 'int',
                map: { default: { primary: 'childId' } }
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('parses and resolves parentKey/childKey in mixed/included sub-resource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test-included'] = structuredClone(resourceConfigs['test']);
            resourceConfigs['test'].config.resource = 'test-included';
            delete resourceConfigs['test'].config.primaryKey;
            delete resourceConfigs['test'].config.dataSources;
            delete resourceConfigs['test'].config.attributes['id'];

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(resourceConfigs['test'].config);
            resourceConfigs['test'].config.attributes['subResource'].parentKey = '{primary}';
            resourceConfigs['test'].config.attributes['subResource'].childKey = '{primary}';

            // just check, if we can resolve keys without error (primaryKey is defined in included sub-resource):
            assert.doesNotThrow(() => configParser(resourceConfigs, mockDataSources));
        });

        it('fails on missing parentKey/childKey', () => {
            let resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = {};
            resourceConfigs['test'].config.attributes['subResource'].resource = 'test';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'childId';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Missing parentKey in sub-resource "test:subResource"')
            );

            // same for childKey:
            resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = {};
            resourceConfigs['test'].config.attributes['subResource'].resource = 'test';
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'parentId';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Missing childKey in sub-resource "test:subResource"')
            );
        });

        it('fails on missing parentKey/childKey in inline-sub-resource', () => {
            let resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'childId';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Missing parentKey in sub-resource "test:subResource"')
            );

            // same for childKey:
            resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'parentId';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Missing childKey in sub-resource "test:subResource"')
            );
        });

        it('fails if parentKey/childKey references unknown attributes', () => {
            let resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = {};
            resourceConfigs['test'].config.attributes['subResource'].resource = 'test';
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'unknownId';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Unknown attribute "unknownId" in parentKey in sub-resource "test:subResource"')
            );

            // same for childKey:
            resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = {};
            resourceConfigs['test'].config.attributes['subResource'].resource = 'test';
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'unknownId';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Unknown attribute "unknownId" in childKey in sub-resource "test:subResource"')
            );
        });

        it('fails if parentKey/childKey references attribute in sub-resource', () => {
            let resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['otherResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['otherResource'].parentKey = 'id';
            resourceConfigs['test'].config.attributes['otherResource'].childKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'otherResource.id';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Path "otherResource.id" references sub-resource in parentKey in sub-resource "test:subResource"'
                )
            );

            // same for childKey:
            resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'otherResource.id';
            resourceConfigs['test'].config.attributes['subResource'].attributes['otherResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].attributes['otherResource'].parentKey =
                'otherResource.id';
            resourceConfigs['test'].config.attributes['subResource'].attributes['otherResource'].childKey = 'id';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Path "otherResource.id" references sub-resource in childKey in sub-resource "test:subResource"'
                )
            );
        });

        it('fails if composite parentKey references multiValued attribute', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['parentId'] = { type: 'int', multiValued: 'true' };
            resourceConfigs['test'].config.dataSources['primary'].expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id,parentId';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id,childId';
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = { type: 'int' };
            resourceConfigs['test'].config.attributes['subResource'].dataSources['primary'].expectedAttributes = [
                'id',
                'childId'
            ];

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Composite key attribute "parentId" must not be multiValued in parentKey in sub-resource "test:subResource"'
                )
            );
        });

        it('allows childKey referencing multiValued attribute', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'childId';
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                multiValued: 'true'
            };
            resourceConfigs['test'].config.attributes['subResource'].dataSources['primary'].expectedAttributes = [
                'id',
                'childId'
            ];

            assert.doesNotThrow(() => configParser(resourceConfigs, mockDataSources), ImplementationError);
        });

        it('allows parentKey mapping to secondary DataSource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.dataSources['secondary'] = { type: 'testDataSource' };
            resourceConfigs['test'].config.dataSources['secondary'].expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].config.attributes['id'] = { map: 'id;secondary:id' };
            resourceConfigs['test'].config.attributes['parentId'] = { type: 'int', map: 'secondary:parentId' };
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'parentId';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id';

            assert.doesNotThrow(() => configParser(resourceConfigs, mockDataSources), Error);
        });

        it('fails if parentKey is not mappable to a single DataSource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.dataSources['secondary'] = { type: 'testDataSource' };
            resourceConfigs['test'].config.dataSources['secondary'].expectedAttributes = ['id', 'parentId1'];
            resourceConfigs['test'].config.dataSources['third'] = { type: 'testDataSource' };
            resourceConfigs['test'].config.dataSources['third'].expectedAttributes = ['id', 'parentId2'];
            resourceConfigs['test'].config.attributes['id'] = { map: 'id;secondary:id;third:id' };
            resourceConfigs['test'].config.attributes['parentId1'] = { type: 'int', map: 'secondary:parentId1' };
            resourceConfigs['test'].config.attributes['parentId2'] = { type: 'int', map: 'third:parentId2' };
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'parentId1,parentId2';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id,id'; // lazy, but ok for this test :-)

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Key is not mappable to a single DataSource ' + 'in parentKey in sub-resource "test:subResource"'
                )
            );
        });

        it('fails if childKey is not mapped to primary DataSources', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].dataSources['secondary'] = {
                type: 'testDataSource'
            };
            resourceConfigs['test'].config.attributes['subResource'].dataSources['secondary'].expectedAttributes = [
                'id',
                'childId'
            ];
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'childId';
            resourceConfigs['test'].config.attributes['subResource'].attributes['id'] = { map: 'id;secondary:id' };
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'secondary:childId'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Key attribute "childId" is not mapped to "primary" DataSource in childKey in sub-resource "test:subResource"'
                )
            );
        });

        it('ignores incomplete key mappings to other DataSources in resolved key', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.dataSources['primary'].expectedAttributes = ['id', 'keyPart2'];
            resourceConfigs['test'].config.dataSources['secondary'] = { type: 'testDataSource' };
            resourceConfigs['test'].config.dataSources['secondary'].expectedAttributes = ['id', 'keyPart2'];
            resourceConfigs['test'].config.dataSources['third'] = { type: 'testDataSource' };
            resourceConfigs['test'].config.dataSources['third'].expectedAttributes = ['id'];
            resourceConfigs['test'].config.attributes['id'].map = 'id;secondary:id;third:id';
            resourceConfigs['test'].config.attributes['keyPart2'] = { type: 'int', map: 'keyPart2;secondary:keyPart2' };
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].dataSources['primary'].expectedAttributes = [
                'id',
                'keyPart2'
            ];
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id,keyPart2';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id,keyPart2';
            resourceConfigs['test'].config.attributes['subResource'].attributes['keyPart2'] = { type: 'int' };

            const resolvedParentKey = {
                primary: ['id', 'keyPart2'],
                secondary: ['id', 'keyPart2']
                // ... and we especially do not expect this in resolvedParentKey:
                // 'third': ['id']
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(
                resourceConfigs['test'].config.attributes['subResource'].resolvedParentKey,
                resolvedParentKey
            );
        });

        it('fails if parentKey and childKey have different length', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigs['test'].config.dataSources['primary'].expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].config.attributes['parentId'] = { type: 'int' };
            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id,parentId';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Composite key length of parentKey (2) does not match childKey length (1) in sub-resource "test:subResource"'
                )
            );
        });

        it('parses option "many"', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].many = 'true';
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id';

            configParser(resourceConfigs, mockDataSources);

            assert.equal(resourceConfigs['test'].config.attributes['subResource'].many, true);
        });

        it('fails on invalid DataSource reference in joinVia', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'unknownRelationTable';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Unknown DataSource "unknownRelationTable" in joinVia in sub-resource "test:subResource"'
                )
            );
        });

        it('parses and resolves joinParentKey and joinChildKey attributes from dataSources', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId',
                expectedAttributes: ['parentIdDbField', 'childIdDbField']
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            resourceConfigsParsed['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigsParsed['test'].config
            );
            resourceConfigsParsed['test'].config.attributes['subResource'].parentKey = [['id']];
            resourceConfigsParsed['test'].config.attributes['subResource'].resolvedParentKey = { primary: ['id'] };
            resourceConfigsParsed['test'].config.attributes['subResource'].childKey = [['id']];
            resourceConfigsParsed['test'].config.attributes['subResource'].resolvedChildKey = { primary: ['id'] };
            resourceConfigsParsed['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigsParsed['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: [['parentId']],
                resolvedJoinParentKey: ['parentIdDbField'],
                joinChildKey: [['childId']],
                resolvedJoinChildKey: ['childIdDbField']
            };
            resourceConfigsParsed['test'].config.attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: { default: { joinTest: 'parentIdDbField' } }
            };
            resourceConfigsParsed['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: { default: { joinTest: 'childIdDbField' } }
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails if joinParentKey or joinChildKey is missing', () => {
            // missing joinChildKey:
            let resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'DataSource "joinTest" misses "joinChildKey" option in sub-resource "test:subResource"'
                )
            );

            // missing joinParentKey:
            resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinChildKey: 'parentId'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'DataSource "joinTest" misses "joinParentKey" option in sub-resource "test:subResource"'
                )
            );

            // missing both:
            resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'DataSource "joinTest" misses "joinParentKey" option in sub-resource "test:subResource"'
                )
            );
        });

        it('fails if joinParentKey/joinChildKey maps to unknown attributes', () => {
            // unknown joinParentKey:
            let resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'unknownParentId',
                joinChildKey: 'childId'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Unknown attribute "unknownParentId" in joinParentKey in sub-resource "test:subResource"'
                )
            );

            // unknown joinChildKey:
            resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'unknownChildId'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Unknown attribute "unknownChildId" in joinChildKey in sub-resource "test:subResource"'
                )
            );
        });

        it('fails if joinParentKey/joinChildKey key length does not match', () => {
            // parent key length does not match:
            let resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id,id'; // key length does not fit!
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId',
                expectedAttributes: ['parentIdDbField', 'childIdDbField']
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Composite key length of parentKey (2) does not match joinParentKey length (1) of DataSource "joinTest" in sub-resource "test:subResource"'
                )
            );

            // child key length does not match:
            resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].config.attributes['subResource'].childKey = 'id,id'; // key length does not fit!
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId',
                expectedAttributes: ['parentIdDbField', 'childIdDbField']
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Composite key length of childKey (2) does not match joinChildKey length (1) of DataSource "joinTest" in sub-resource "test:subResource"'
                )
            );
        });

        it('fails if joinParentKey/joinChildKey attributes misses mapping to the DataSource', () => {
            // Missing mapping in joinParentKey:
            let resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['primary'].expectedAttributes.push(
                'otherMapping'
            );
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'otherMapping'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            assert.throws(() => configParser(resourceConfigs, mockDataSources), {
                name: 'ImplementationError',
                message:
                    'Key attribute "parentId" is not mapped to "joinTest" DataSource in joinParentKey in sub-resource "test:subResource"'
            });

            // Missing mapping in joinChildKey:
            resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['subResource'] = structuredClone(
                minimalResourceConfigs['test'].config
            );
            resourceConfigs['test'].config.attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].config.attributes['subResource'].dataSources['primary'].expectedAttributes.push(
                'otherMapping'
            );
            resourceConfigs['test'].config.attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };
            resourceConfigs['test'].config.attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'otherMapping'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Key attribute "childId" is not mapped to "joinTest" DataSource in joinChildKey in sub-resource "test:subResource"'
                )
            );
        });
    });

    describe('options in attribute-context', () => {
        it('fails on invalid options in attribute-context', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['id'].parentKey = 'testId';

            assert.throws(() => configParser(resourceConfigs, mockDataSources), {
                name: 'ImplementationError',
                message: 'Invalid option "parentKey" in attribute "test:id"'
            });
        });

        it('fails on invalid "type" option', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['id'].type = 'no-int';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Invalid "no-int" (allowed: string, int, float, boolean, date, datetime, time, raw, object, json) (option "type" in attribute "test:id")'
                )
            );
        });

        it('parses option "map" and collects attributes per DataSource', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.dataSources['articleBody'] = {
                type: 'testDataSource',
                expectedAttributes: ['articleId']
            };
            resourceConfigs['test'].config.attributes['id'].map = 'id;articleBody:articleId';

            resourceConfigsParsed['test'].config.dataSources['articleBody'] = {
                type: 'testDataSource'
            };
            resourceConfigsParsed['test'].config.attributes['id'].map = {
                default: {
                    primary: 'id',
                    articleBody: 'articleId'
                }
            };
            resourceConfigsParsed['test'].config.resolvedPrimaryKey['articleBody'] = ['articleId'];

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('generates default attribute mapping with relative hierarchy (dot-separated)', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['meta'] = { attributes: { title: {} } };
            resourceConfigs['test'].config.dataSources['primary'].expectedAttributes.push('meta.title');
            resourceConfigsParsed['test'].config.attributes['meta'] = {
                attributes: {
                    title: {
                        type: 'string',
                        map: {
                            default: {
                                primary: 'meta.title'
                            }
                        }
                    }
                }
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails on invalid DataSource references in map', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['id'].map = 'id;nonExisting:articleId';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Unknown DataSource "nonExisting" in map in attribute "test:id"')
            );
        });

        it('parses option "filter"', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['id'].filter = 'equal,notEqual';
            resourceConfigsParsed['test'].config.attributes['id'].filter = ['equal', 'notEqual'];

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails on invalid filter options', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['id'].filter = 'roundAbout';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    `Invalid "roundAbout" (allowed: equal, notEqual, greater, greaterOrEqual, less, lessOrEqual, like, between, notBetween) (option "filter" in attribute "test:id")`
                )
            );
        });

        it('parses option "order"', () => {
            let resourceConfigs = structuredClone(minimalResourceConfigs);
            let resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['id'].order = 'asc,random';
            resourceConfigsParsed['test'].config.attributes['id'].order = ['asc', 'random'];

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);

            // test "true":
            resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['id'].order = 'true';
            resourceConfigsParsed['test'].config.attributes['id'].order = ['asc', 'desc'];

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails on invalid order options', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['id'].order = 'phaseOfTheMoon';

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    `Invalid "phaseOfTheMoon" (allowed: asc, desc, random, topflop) (option "order" in attribute "test:id")`
                )
            );
        });

        it('handles "value" option (no default mapping for static values) and parses "null" as null', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['dummy'] = { value: 'null' };
            resourceConfigsParsed['test'].config.attributes['dummy'] = { value: null, type: 'string' };
            // ... no "map" for "dummy" attribute and no "dummy" in expectedAttributes!

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails if "value" has mapping defined', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            // const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['dummy'] = { value: 'null', map: 'dummy' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError(
                    'Static "value" in combination with "map" makes no sense in attribute "test:dummy"'
                )
            );
        });

        it('parses option "depends" as Select-AST', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['copyright'] = {
                depends: 'author[firstname,lastname]',
                value: ''
            };
            resourceConfigsParsed['test'].config.attributes['copyright'] = {
                depends: { author: { select: { firstname: {}, lastname: {} } } },
                value: '',
                type: 'string'
            };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('parses option "hidden"', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);
            const resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['dummy'] = { hidden: 'true', value: '' };
            resourceConfigsParsed['test'].config.attributes['dummy'] = { hidden: true, value: '', type: 'string' };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('parses option "deprecated"', () => {
            let resourceConfigs = structuredClone(minimalResourceConfigs);
            let resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['dummy'] = { deprecated: 'true', value: '' };
            resourceConfigsParsed['test'].config.attributes['dummy'] = { deprecated: true, value: '', type: 'string' };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);

            // and with "false":
            resourceConfigs = structuredClone(minimalResourceConfigs);
            resourceConfigsParsed = structuredClone(minimalResourceConfigsParsed);

            resourceConfigs['test'].config.attributes['dummy'] = { deprecated: 'false', value: '' };
            resourceConfigsParsed['test'].config.attributes['dummy'] = { deprecated: false, value: '', type: 'string' };

            configParser(resourceConfigs, mockDataSources);

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });

        it('fails on invalid boolean values', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['dummy'] = { deprecated: 'maybe' };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Invalid boolean value "maybe" (option "deprecated" in attribute "test:dummy")')
            );
        });
    });

    describe('options in nested-attribute-context', () => {
        it('fails on invalid options in nested-attribute-context (no valid options here)', () => {
            const resourceConfigs = structuredClone(minimalResourceConfigs);

            resourceConfigs['test'].config.attributes['nested'] = {
                attributes: {},
                type: 'int'
            };

            assert.throws(
                () => configParser(resourceConfigs, mockDataSources),
                new ImplementationError('Invalid option "type" in nested-attribute "test:nested"')
            );
        });
    });

    describe('complex config parsing', () => {
        it('parses our example resources', () => {
            const resourceConfigs = structuredClone(require('./fixtures/resources-loaded.json'));
            const resourceConfigsParsed = require('./fixtures/resources-parsed.json');

            // test attributes in prepare()-call of all DataSources:
            resourceConfigs['article'].config.dataSources['primary'].expectedAttributes = [
                'id',
                'timestamp',
                'title',
                'authorId',
                'countries',
                'sourceName',
                'externalId',
                'externalUrl',
                'secretInfo'
            ];
            resourceConfigs['article'].config.dataSources['articleBody'].expectedAttributes = ['articleId', 'body'];
            resourceConfigs['article'].config.dataSources['fulltextSearch'].expectedAttributes = ['articleId'];
            resourceConfigs['article'].config.dataSources['statistics'].expectedAttributes = [
                'articleId',
                'commentCount'
            ];
            resourceConfigs['article'].config.attributes['categories'].dataSources['primary'].expectedAttributes = [
                'id',
                'name',
                'isImportant'
            ];
            resourceConfigs['article'].config.attributes['categories'].dataSources[
                'articleCategories'
            ].expectedAttributes = ['articleId', 'categoryId', 'order'];
            resourceConfigs['article'].config.attributes['countries'].dataSources['primary'].expectedAttributes = [
                'id',
                'name',
                'iso',
                'iso3'
            ];
            resourceConfigs['article'].config.attributes['video'].dataSources['primary'].expectedAttributes = [
                'articleId',
                'url',
                'previewImage',
                'youtubeId'
            ];
            resourceConfigs['article'].config.attributes['comments'].dataSources['primary'].expectedAttributes = [
                'articleId',
                'id',
                'userId',
                'content'
            ];
            resourceConfigs['article'].config.attributes['comments'].dataSources['likes'].expectedAttributes = [
                'commentId',
                'count'
            ];
            resourceConfigs['article'].config.attributes['versions'].dataSources['primary'].expectedAttributes = [
                'articleId',
                'versionId',
                'title',
                'body'
            ];
            resourceConfigs['article'].config.attributes['versions'].attributes['versioninfo'].dataSources[
                'primary'
            ].expectedAttributes = ['articleId', 'versionId', 'modified', 'username'];
            resourceConfigs['user'].config.dataSources['primary'].expectedAttributes = ['id', 'firstname', 'lastname'];

            configParser(resourceConfigs, mockDataSources);

            // for manually generating fixture:
            //console.log(JSON.stringify(resourceConfigs, null, 4));

            assert.deepEqual(resourceConfigs, resourceConfigsParsed);
        });
    });
});

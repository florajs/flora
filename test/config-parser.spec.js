'use strict';

var configParser = require('../lib/config-parser');
var ImplementationError = require('flora-errors').ImplementationError;

var _ = require('lodash');
var expect = require('chai').expect;

var mockDataSource = {
    prepare: function (rawRequest, attributes) {
        if (!rawRequest.expectedAttributes) {
            throw new Error('Mocked DataSource: Please set expectedAttributes for all DataSources in your test');
        }

        expect(attributes).to.eql(rawRequest.expectedAttributes);

        delete rawRequest.expectedAttributes;
    },
    process: function (/*request, callback*/) {}
};
var mockDataSources = {
    'testDataSource': mockDataSource,
    'mysql': mockDataSource,
    'solr': mockDataSource
};

var minimalResourceConfigs = {
    "test": {
        "primaryKey": "id",
        "dataSources": {
            "primary": {
                "type": "testDataSource",
                expectedAttributes: ['id']
            }
        },
        "attributes": {
            "id": {
                "type": "int"
            }
        }
    }
};
var minimalResourceConfigsParsed = {
    "test": {
        "primaryKey": [["id"]],
        "resolvedPrimaryKey": {
            "primary": ["id"]
        },
        "dataSources": {
            "primary": {
                "type": "testDataSource"
            }
        },
        "attributes": {
            "id": {
                "type": "int",
                "map": {
                    "default": {
                        "primary": "id"
                    }
                },
                "filter": ["equal"]
            }
        }
    }
};

describe('config-parser', function () {
    describe('basic config parsing', function () {
        it('parses minimal resource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('parses minimal "symlink"-resource', function () {
            var resourceConfigs = {
                "test": {
                    "resource": "test2"
                },
                "test2": _.cloneDeep(minimalResourceConfigs['test'])
            };
            var resourceConfigsParsed = {
                "test": {
                    "resource": "test2"
                },
                "test2": _.cloneDeep(minimalResourceConfigsParsed['test'])
            };

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails on unknown "symlink"-resource', function () {
            var resourceConfigs = {
                "test": {
                    "resource": "test2"
                }
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Unknown resource "test2" in resource "test:{root}"');
        });
    });

    describe('options in resource-context', function () {
        it('fails on invalid options in resource-context', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].type = 'int';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Invalid option "type" in resource "test:{root}"');
        });

        it('fails on unknown sub-resource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = {resource: 'unknown'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Unknown resource "unknown" in sub-resource "test:subResource"');
        });

        it('fails on DataSources without "type" option', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].dataSources['articleBody'] = {};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'DataSource "articleBody" misses "type" option in resource "test:{root}"');
        });

        it('fails on unknown DataSource types', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].dataSources['primary'] = {type: 'unknown'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Invalid DataSource type "unknown" in resource "test:{root}"');
        });

        it('parses subFilters and its options', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].subFilters = [{
                attribute: 'author.groupId',
                filter: 'true'
            }];

            resourceConfigsParsed['test'].subFilters = [{
                attribute: ['author', 'groupId'],
                filter: ['equal']
            }];

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails if subFilters defined for included sub-resource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = {
                resource: 'test',
                subFilters: []
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Adding subFilters for included sub-resource is not allowed in sub-resource "test:subResource"');
        });

        it('fails on syntactically invalid option "resource"', function () {
            var resourceConfigs = {
                "test": {
                    "resource": "!test"
                }
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Invalid resource name "!test" (option "resource" in resource "test:{root}")');
        });

        it('allows sub-resources with "/"', function () {
            var resourceConfigs = {
                "test": {
                    "resource": "test/subresource"
                },
                "test/subresource": {
                    "resource": "test/subresource"
                }
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.not.throw(ImplementationError);

            expect(resourceConfigs['test'].resource).to.equal('test/subresource');
        });

        it('parses and resolves composite primaryKey', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].primaryKey = 'id,context';
            resourceConfigs['test'].attributes['context'] = {map: 'ctx'};
            resourceConfigs['test'].dataSources['primary'].expectedAttributes = ['id', 'ctx'];

            resourceConfigsParsed['test'].primaryKey = [['id'], ['context']];
            resourceConfigsParsed['test'].resolvedPrimaryKey = {'primary': ['id', 'ctx']};
            resourceConfigsParsed['test'].attributes['context'] = {
                type: 'string',
                map: {
                    'default': {
                        'primary': 'ctx'
                    }
                }
            };

            // no default filter for composite keys:
            delete resourceConfigsParsed['test'].attributes['id'].filter;

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('does not set default filter on hidden primaryKey', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['id'].hidden = 'true';
            resourceConfigsParsed['test'].attributes['id'].hidden = true;
            delete resourceConfigsParsed['test'].attributes['id'].filter;

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('parses and resolves primaryKey in nested attributes', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].primaryKey = 'meta.id';
            resourceConfigs['test'].attributes['meta'] =
                {attributes: {'id': resourceConfigs['test'].attributes['id']}};
            resourceConfigs['test'].attributes['meta'].attributes['id'].map = 'id';
            delete resourceConfigs['test'].attributes['id'];

            resourceConfigsParsed['test'].primaryKey = [['meta', 'id']];
            resourceConfigsParsed['test'].resolvedPrimaryKey = {'primary': ['id']};
            resourceConfigsParsed['test'].attributes['meta'] =
                {attributes: {'id': resourceConfigsParsed['test'].attributes['id']}};
            delete resourceConfigsParsed['test'].attributes['id'];

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails on missing primaryKey', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            delete resourceConfigs['test'].primaryKey;

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Missing primaryKey in resource "test:{root}"');
        });

        it('fails on missing primaryKey in inline-sub-resource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            delete resourceConfigs['test'].attributes['subResource'].primaryKey;
            resourceConfigs['test'].attributes['subResource'].parentKey = '{primary}';
            resourceConfigs['test'].attributes['subResource'].childKey = '{primary}';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Missing primaryKey in sub-resource "test:subResource"');
        });

        it('fails if primaryKey references unknown attributes', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].primaryKey = 'unknownId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Unknown attribute "unknownId" in primaryKey in resource "test:{root}"');
        });

        it('fails if primaryKey references attribute in sub-resource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].primaryKey = 'subResource.id';
            resourceConfigs['test'].attributes['subResource'] = {resource: 'test'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Path "subResource.id" references sub-resource in primaryKey in resource "test:{root}"');
        });

        it('fails if primaryKey references multiValued attribute', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['id'].multiValued = 'true';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Key attribute "id" must not be multiValued in primaryKey in resource "test:{root}"');
        });

        it('fails if primaryKey references static ("value") attribute', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['id'] = {value: 'static'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Key attribute "id" is not mapped to "primary" DataSource ' +
                'in primaryKey in resource "test:{root}"');
        });

        it('fails if primaryKey is overwritten for included sub-resource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = {
                resource: 'test',
                primaryKey: 'id'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Overwriting primaryKey for included sub-resource is not allowed in sub-resource "test:subResource"');
        });

        it('fails if primaryKey is not mapped to all DataSources', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].primaryKey = 'id,context';
            resourceConfigs['test'].dataSources['secondary'] = {type: 'testDataSource'};
            resourceConfigs['test'].attributes['id'] = {map: 'id;secondary:id'};
            resourceConfigs['test'].attributes['context'] = {map: 'ctx'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Key attribute "context" is not mapped to "secondary" DataSource ' +
                'in primaryKey in resource "test:{root}"');
        });

        it('parses and resolves parentKey/childKey', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['parentId'] = {type: 'int', map: 'parentIdDbField'};
            resourceConfigs['test'].dataSources['primary'].
                expectedAttributes = ['id', 'parentIdDbField'];
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'parentId';
            resourceConfigs['test'].attributes['subResource'].childKey = 'childId';
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] =
                {type: 'int', map: 'childIdDbField'};
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].
                expectedAttributes = ['id', 'childIdDbField'];

            resourceConfigsParsed['test'].attributes['parentId'] = {
                type: 'int',
                map: {default: {'primary': 'parentIdDbField'}}
            };
            resourceConfigsParsed['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigsParsed['test']);
            resourceConfigsParsed['test'].attributes['subResource'].parentKey = [['parentId']];
            resourceConfigsParsed['test'].attributes['subResource'].resolvedParentKey = {'primary': ['parentIdDbField']};
            resourceConfigsParsed['test'].attributes['subResource'].childKey = [['childId']];
            resourceConfigsParsed['test'].attributes['subResource'].resolvedChildKey = {'primary': ['childIdDbField']};
            resourceConfigsParsed['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: {default: {'primary': 'childIdDbField'}}
            };

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('parses and resolves composite parentKey/childKey', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['parentId'] = {type: 'int', map: 'parentIdDbField'};
            resourceConfigs['test'].attributes['context'] = {type: 'int', map: 'contextDbField'};
            resourceConfigs['test'].dataSources['primary'].
                expectedAttributes = ['id', 'parentIdDbField', 'contextDbField'];
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'parentId,context';
            resourceConfigs['test'].attributes['subResource'].childKey = 'childId,context';
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] =
                {type: 'int', map: 'childIdDbField'};
            resourceConfigs['test'].attributes['subResource'].attributes['context'] =
                {type: 'int', map: 'contextDbField'};
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].
                expectedAttributes = ['id', 'childIdDbField', 'contextDbField'];

            resourceConfigsParsed['test'].attributes['parentId'] = {
                type: 'int',
                map: {default: {'primary': 'parentIdDbField'}}
            };
            resourceConfigsParsed['test'].attributes['context'] = {
                type: 'int',
                map: {default: {'primary': 'contextDbField'}}
            };
            resourceConfigsParsed['test'].attributes['subResource'] =
                _.cloneDeep(minimalResourceConfigsParsed['test']);
            resourceConfigsParsed['test'].attributes['subResource'].parentKey = [['parentId'], ['context']];
            resourceConfigsParsed['test'].attributes['subResource'].resolvedParentKey =
                {'primary': ['parentIdDbField', 'contextDbField']};
            resourceConfigsParsed['test'].attributes['subResource'].childKey = [['childId'], ['context']];
            resourceConfigsParsed['test'].attributes['subResource'].resolvedChildKey =
                {'primary': ['childIdDbField', 'contextDbField']};
            resourceConfigsParsed['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: {default: {'primary': 'childIdDbField'}}
            };
            resourceConfigsParsed['test'].attributes['subResource'].attributes['context'] = {
                type: 'int',
                map: {default: {'primary': 'contextDbField'}}
            };

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('parses and resolves parentKey/childKey in nested attributes', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['meta'] = {attributes: {}};
            resourceConfigs['test'].attributes['meta'].attributes['parentId'] = {type: 'int', map: 'parentId'};
            resourceConfigs['test'].dataSources['primary'].
                expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'meta.parentId';
            resourceConfigs['test'].attributes['subResource'].childKey = 'meta.childId';
            resourceConfigs['test'].attributes['subResource'].attributes['meta'] = {attributes: {}};
            resourceConfigs['test'].attributes['subResource'].attributes['meta'].attributes['childId'] =
                {type: 'int', map: 'childId'};
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].
                expectedAttributes = ['id', 'childId'];

            resourceConfigsParsed['test'].attributes['meta'] = {attributes: {}};
            resourceConfigsParsed['test'].attributes['meta'].attributes['parentId'] = {
                type: 'int',
                map: {default: {'primary': 'parentId'}}
            };
            resourceConfigsParsed['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigsParsed['test']);
            resourceConfigsParsed['test'].attributes['subResource'].parentKey = [['meta', 'parentId']];
            resourceConfigsParsed['test'].attributes['subResource'].resolvedParentKey = {'primary': ['parentId']};
            resourceConfigsParsed['test'].attributes['subResource'].childKey = [['meta', 'childId']];
            resourceConfigsParsed['test'].attributes['subResource'].resolvedChildKey = {'primary': ['childId']};
            resourceConfigsParsed['test'].attributes['subResource'].attributes['meta'] = {attributes: {}};
            resourceConfigsParsed['test'].attributes['subResource'].attributes['meta'].attributes['childId'] = {
                type: 'int',
                map: {default: {'primary': 'childId'}}
            };

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails on missing parentKey/childKey', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = {};
            resourceConfigs['test'].attributes['subResource'].resource = 'test';
            resourceConfigs['test'].attributes['subResource'].childKey = 'childId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Missing parentKey in sub-resource "test:subResource"');

            // same for childKey:
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = {};
            resourceConfigs['test'].attributes['subResource'].resource = 'test';
            resourceConfigs['test'].attributes['subResource'].parentKey = 'parentId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Missing childKey in sub-resource "test:subResource"');
        });

        it('fails on missing parentKey/childKey in inline-sub-resource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].childKey = 'childId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Missing parentKey in sub-resource "test:subResource"');

            // same for childKey:
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'parentId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Missing childKey in sub-resource "test:subResource"');
        });

        it('fails if parentKey/childKey references unknown attributes', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = {};
            resourceConfigs['test'].attributes['subResource'].resource = 'test';
            resourceConfigs['test'].attributes['subResource'].parentKey = 'unknownId';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Unknown attribute "unknownId" in parentKey in sub-resource "test:subResource"');

            // same for childKey:
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = {};
            resourceConfigs['test'].attributes['subResource'].resource = 'test';
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'unknownId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Unknown attribute "unknownId" in childKey in sub-resource "test:subResource"');
        });

        it('fails if parentKey/childKey references attribute in sub-resource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['otherResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['otherResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['otherResource'].childKey = 'id';
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'otherResource.id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Path "otherResource.id" references sub-resource in parentKey in sub-resource "test:subResource"');

            // same for childKey:
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'otherResource.id';
            resourceConfigs['test'].attributes['subResource'].attributes['otherResource'] =
                _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].attributes['otherResource'].
                parentKey = 'otherResource.id';
            resourceConfigs['test'].attributes['subResource'].attributes['otherResource'].
                childKey = 'id';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Path "otherResource.id" references sub-resource in childKey in sub-resource "test:subResource"');
        });

        it('fails if composite parentKey references multiValued attribute', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['parentId'] = {type: 'int', multiValued: 'true'};
            resourceConfigs['test'].dataSources['primary'].expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id,parentId';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id,childId';
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] = {type: 'int'};
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].
                expectedAttributes = ['id', 'childId'];

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Composite key attribute "parentId" must not be multiValued in parentKey in sub-resource "test:subResource"');
        });

        it('fails if childKey references multiValued attribute', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'childId';
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] =
                {type: 'int', multiValued: 'true'};
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].
                expectedAttributes = ['id', 'childId'];

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Key attribute "childId" must not be multiValued in childKey in sub-resource "test:subResource"');
        });

        it('fails if parentKey/childKey is not mapped to primary DataSources', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].dataSources['secondary'] = {type: 'testDataSource'};
            resourceConfigs['test'].dataSources['secondary'].expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].attributes['id'] = {map: 'id;secondary:id'};
            resourceConfigs['test'].attributes['parentId'] = {type: 'int', map: 'secondary:parentId'};
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'parentId';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Key attribute "parentId" is not mapped to "primary" DataSource ' +
                'in parentKey in sub-resource "test:subResource"');

            // same for childKey:
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].dataSources['secondary'] = {type: 'testDataSource'};
            resourceConfigs['test'].attributes['subResource'].dataSources['secondary'].
                expectedAttributes = ['id', 'childId'];
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'childId';
            resourceConfigs['test'].attributes['subResource'].attributes['id'] = {map: 'id;secondary:id'};
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] =
                {type: 'int', map: 'secondary:childId'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Key attribute "childId" is not mapped to "primary" DataSource ' +
                'in childKey in sub-resource "test:subResource"');
        });

        it('ignores incomplete key mappings to other DataSources in resolved key', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].dataSources['primary'].expectedAttributes = ['id', 'keyPart2'];
            resourceConfigs['test'].dataSources['secondary'] = {type: 'testDataSource'};
            resourceConfigs['test'].dataSources['secondary'].expectedAttributes = ['id', 'keyPart2'];
            resourceConfigs['test'].dataSources['third'] = {type: 'testDataSource'};
            resourceConfigs['test'].dataSources['third'].expectedAttributes = ['id'];
            resourceConfigs['test'].attributes['id'].map = 'id;secondary:id;third:id';
            resourceConfigs['test'].attributes['keyPart2'] = {type: 'int', map: 'keyPart2;secondary:keyPart2'};
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].
                expectedAttributes = ['id', 'keyPart2'];
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id,keyPart2';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id,keyPart2';
            resourceConfigs['test'].attributes['subResource'].attributes['keyPart2'] = {type: 'int'};

            var resolvedParentKey = {
                'primary': ['id', 'keyPart2'],
                'secondary': ['id', 'keyPart2']
                // ... and we especially do not expect this in resolvedParentKey:
                // 'third': ['id']
            };

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs['test'].attributes['subResource'].resolvedParentKey).
                to.eql(resolvedParentKey);
        });

        it('fails if parentKey and childKey have different length', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigs['test'].dataSources['primary'].
                expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].attributes['parentId'] = {type: 'int'};
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id,parentId';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Composite key length of parentKey (2) does not match childKey length (1) ' +
                'in sub-resource "test:subResource"');
        });

        it('parses option "many"', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].many = 'true';
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id';

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs['test'].attributes['subResource'].many).to.be.true;
        });

        it('fails on invalid DataSource reference in joinVia', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].joinVia = 'unknownRelationTable';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Unknown DataSource "unknownRelationTable" in joinVia in sub-resource "test:subResource"');
        });

        it('parses and resolves joinParentKey and joinChildKey attributes from dataSources', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id';
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId',
                expectedAttributes: ['parentIdDbField', 'childIdDbField']
            };
            resourceConfigs['test'].attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            resourceConfigsParsed['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigsParsed['test']);
            resourceConfigsParsed['test'].attributes['subResource'].parentKey = [['id']];
            resourceConfigsParsed['test'].attributes['subResource'].resolvedParentKey = {'primary': ['id']};
            resourceConfigsParsed['test'].attributes['subResource'].childKey = [['id']];
            resourceConfigsParsed['test'].attributes['subResource'].resolvedChildKey = {'primary': ['id']};
            resourceConfigsParsed['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigsParsed['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: [['parentId']],
                resolvedJoinParentKey: ['parentIdDbField'],
                joinChildKey: [['childId']],
                resolvedJoinChildKey: ['childIdDbField']
            };
            resourceConfigsParsed['test'].attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: {'default': {'joinTest': 'parentIdDbField'}}
            };
            resourceConfigsParsed['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: {'default': {'joinTest': 'childIdDbField'}}
            };

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails if joinParentKey or joinChildKey is missing', function () {
            // missing joinChildKey:
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'DataSource "joinTest" misses "joinChildKey" option in sub-resource "test:subResource"');

            // missing joinParentKey:
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinChildKey: 'parentId'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'DataSource "joinTest" misses "joinParentKey" option in sub-resource "test:subResource"');

            // missing both:
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {type: 'testDataSource'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'DataSource "joinTest" misses "joinParentKey" option in sub-resource "test:subResource"');
        });

        it('fails if joinParentKey/joinChildKey maps to unknown attributes', function () {
            // unknown joinParentKey:
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'unknownParentId',
                joinChildKey: 'childId'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Unknown attribute "unknownParentId" in joinParentKey in sub-resource "test:subResource"');

            // unknown joinChildKey:
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'unknownChildId'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Unknown attribute "unknownChildId" in joinChildKey in sub-resource "test:subResource"');
        });

        it('fails if joinParentKey/joinChildKey key length does not match', function () {
            // parent key length does not match:
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id,id'; // key length does not fit!
            resourceConfigs['test'].attributes['subResource'].childKey = 'id';
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId',
                expectedAttributes: ['parentIdDbField', 'childIdDbField']
            };
            resourceConfigs['test'].attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Composite key length of parentKey (2) does not match ' +
                'joinParentKey length (1) of DataSource "joinTest" in sub-resource "test:subResource"');

            // child key length does not match:
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id,id'; // key length does not fit!
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId',
                expectedAttributes: ['parentIdDbField', 'childIdDbField']
            };
            resourceConfigs['test'].attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Composite key length of childKey (2) does not match ' +
                'joinChildKey length (1) of DataSource "joinTest" in sub-resource "test:subResource"');
        });

        it('fails if joinParentKey/joinChildKey attributes misses mapping to the DataSource', function () {
            // Missing mapping in joinParentKey:
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].expectedAttributes.push('otherMapping');
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'otherMapping'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'joinTest:childIdDbField'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Key attribute "parentId" is not mapped to "joinTest" DataSource in joinParentKey in sub-resource "test:subResource"');

            // Missing mapping in joinChildKey:
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].expectedAttributes.push('otherMapping');
            resourceConfigs['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: 'parentId',
                joinChildKey: 'childId'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['parentId'] = {
                type: 'int',
                map: 'joinTest:parentIdDbField'
            };
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: 'otherMapping'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Key attribute "childId" is not mapped to "joinTest" DataSource in joinChildKey in sub-resource "test:subResource"');
        });
    });

    describe('options in attribute-context', function () {
        it('fails on invalid options in attribute-context', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['id'].parentKey = 'testId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Invalid option "parentKey" in attribute "test:id"');
        });

        it('fails on invalid "type" option', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['id'].type = 'no-int';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Invalid "no-int" (allowed: string, int, float, boolean, date, datetime, time, raw) ' +
                '(option "type" in attribute "test:id")');
        });

        it('parses option "map" and collects attributes per DataSource', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].dataSources['articleBody'] = {
                type: 'testDataSource',
                expectedAttributes: ['articleId']
            };
            resourceConfigs['test'].attributes['id'].map = 'id;articleBody:articleId';

            resourceConfigsParsed['test'].dataSources['articleBody'] = {
                type: 'testDataSource'
            };
            resourceConfigsParsed['test'].attributes['id'].map = {
                'default': {
                    'primary': 'id',
                    'articleBody': 'articleId'
                }
            };
            resourceConfigsParsed['test'].resolvedPrimaryKey['articleBody'] = ['articleId'];

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('generates default attribute mapping with relative hierarchy (dot-separated)', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['meta'] = {attributes: {'title': {}}};
            resourceConfigs['test'].dataSources['primary'].expectedAttributes.push('meta.title');
            resourceConfigsParsed['test'].attributes['meta'] = {attributes: {
                'title': {
                    type: 'string',
                    map: {
                        'default': {
                            'primary': 'meta.title'
                        }
                    }
                }
            }};

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails on invalid DataSource references in map', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['id'].map = 'id;nonExisting:articleId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Unknown DataSource "nonExisting" in map in attribute "test:id"');
        });

        it('parses option "filter"', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['id'].filter = 'equal,notEqual';
            resourceConfigsParsed['test'].attributes['id'].filter = ['equal', 'notEqual'];

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails on invalid filter options', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['id'].filter = 'roundAbout';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Invalid "roundAbout" (allowed: equal, notEqual, greater, greaterOrEqual, less, lessOrEqual) ' +
                '(option "filter" in attribute "test:id")');
        });

        it('parses option "order"', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['id'].order = 'asc,random';
            resourceConfigsParsed['test'].attributes['id'].order = ['asc', 'random'];

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);

            // test "true":
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['id'].order = 'true';
            resourceConfigsParsed['test'].attributes['id'].order = ['asc', 'desc'];

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails on invalid order options', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['id'].order = 'phaseOfTheMoon';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Invalid "phaseOfTheMoon" (allowed: asc, desc, random, topflop) ' +
                '(option "order" in attribute "test:id")');
        });

        it('handles "value" option (no default mapping for static values) and parses "null" as null', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['dummy'] = {value: 'null'};
            resourceConfigsParsed['test'].attributes['dummy'] = {value: null, type: 'string'};
            // ... no "map" for "dummy" attribute and no "dummy" in expectedAttributes!

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails if "value" has mapping defined', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['dummy'] = {value: 'null', map: 'dummy'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Static "value" in combination with "map" makes no sense in attribute "test:dummy"');
        });

        it('parses option "depends" as Select-AST', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['copyright'] = {depends: 'author[firstname,lastname]', value: ''};
            resourceConfigsParsed['test'].attributes['copyright'] =
                {depends: {'author': {select: {'firstname': {}, 'lastname': {}}}}, value: '', type: 'string'};

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('parses option "hidden"', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['dummy'] = {hidden: 'true', value: ''};
            resourceConfigsParsed['test'].attributes['dummy'] = {hidden: true, value: '', type: 'string'};

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('parses option "deprecated"', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['dummy'] = {deprecated: 'true', value: ''};
            resourceConfigsParsed['test'].attributes['dummy'] = {deprecated: true, value: '', type: 'string'};

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);

            // and with "false":
            resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['dummy'] = {deprecated: 'false', value: ''};
            resourceConfigsParsed['test'].attributes['dummy'] = {deprecated: false, value: '', type: 'string'};

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('fails on invalid boolean values', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['dummy'] = {deprecated: 'maybe'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Invalid boolean value "maybe" (option "deprecated" in attribute "test:dummy")');
        });
    });

    describe('options in nested-attribute-context', function () {
        it('fails on invalid options in nested-attribute-context (no valid options here)', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['nested'] = {
                'attributes': {},
                'type': 'int'
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError, 'Invalid option "type" in nested-attribute "test:nested"');
        });
    });

    describe('complex config parsing', function () {
        it('parses our example resources', function () {
            var resourceConfigs = require('./fixtures/resources-loaded.json');
            var resourceConfigsParsed = require('./fixtures/resources-parsed.json');

            resourceConfigs = _.cloneDeep(resourceConfigs);

            // test attributes in prepare()-call of all DataSources:
            resourceConfigs['article'].dataSources['primary'].expectedAttributes =
                ['id', 'timestamp', 'title', 'authorId', 'countries',
                'sourceName', 'externalId', 'externalUrl', 'secretInfo'];
            resourceConfigs['article'].dataSources['articleBody'].expectedAttributes =
                ['articleId', 'body'];
            resourceConfigs['article'].dataSources['fulltextSearch'].expectedAttributes =
                ['articleId'];
            resourceConfigs['article'].dataSources['statistics'].expectedAttributes =
                ['articleId', 'commentCount'];
            resourceConfigs['article'].attributes['categories'].dataSources['primary'].expectedAttributes =
                ['id', 'name', 'isImportant'];
            resourceConfigs['article'].attributes['categories'].dataSources['articleCategories'].expectedAttributes =
                ['articleId', 'categoryId', 'order'];
            resourceConfigs['article'].attributes['countries'].dataSources['primary'].expectedAttributes =
                ['id', 'name', 'iso', 'iso3'];
            resourceConfigs['article'].attributes['video'].dataSources['primary'].expectedAttributes =
                ['articleId', 'url', 'previewImage', 'youtubeId'];
            resourceConfigs['article'].attributes['comments'].dataSources['primary'].expectedAttributes =
                ['articleId', 'id', 'userId', 'content'];
            resourceConfigs['article'].attributes['comments'].dataSources['likes'].expectedAttributes =
                ['commentId', 'count'];
            resourceConfigs['article'].attributes['versions'].dataSources['primary'].expectedAttributes =
                ['articleId', 'versionId', 'title', 'body'];
            resourceConfigs['article'].attributes['versions'].attributes['versioninfo'].dataSources['primary'].expectedAttributes =
                ['articleId', 'versionId', 'modified', 'username'];
            resourceConfigs['user'].dataSources['primary'].expectedAttributes =
                ['id', 'firstname', 'lastname'];

            configParser(resourceConfigs, mockDataSources);

            // for manually generating fixture:
            //console.log(JSON.stringify(resourceConfigs, null, 4));

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });
    });
});

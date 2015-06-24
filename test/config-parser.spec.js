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
                }
            };
            var resourceConfigsParsed = {
                "test": {
                    "resource": "test2"
                }
            };

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
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

        it('fails on syntactically invalid option "resource"', function () {
            var resourceConfigs = {
                "test": {
                    "resource": "!test"
                }
            };

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Invalid identifier "!test" (option "resource" in resource "test:{root}")');
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

        it('fails if primaryKey is not mapped to all DataSources', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].primaryKey = 'id,context';
            resourceConfigs['test'].dataSources['secondary'] = {type: 'testDataSource'};
            resourceConfigs['test'].attributes['id'] = {map: 'id;secondary:id'};
            resourceConfigs['test'].attributes['context'] = {map: 'ctx'};

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Primary key attribute "context" is not mapped to "secondary" DataSource ' +
                'in primaryKey in resource "test:{root}"');
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

        it('parses parentKey/childKey', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['parentId'] = {type: 'int'};
            resourceConfigs['test'].dataSources['primary'].
                expectedAttributes = ['id', 'parentId'];
            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'parentId';
            resourceConfigs['test'].attributes['subResource'].childKey = 'childId';
            resourceConfigs['test'].attributes['subResource'].attributes['childId'] = {type: 'int'};
            resourceConfigs['test'].attributes['subResource'].dataSources['primary'].
                expectedAttributes = ['id', 'childId'];

            resourceConfigsParsed['test'].attributes['parentId'] = {
                type: 'int',
                map: {default: {'primary': 'parentId'}}
            };
            resourceConfigsParsed['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigsParsed['test']);
            resourceConfigsParsed['test'].attributes['subResource'].parentKey = [['parentId']];
            resourceConfigsParsed['test'].attributes['subResource'].childKey = [['childId']];
            resourceConfigsParsed['test'].attributes['subResource'].attributes['childId'] = {
                type: 'int',
                map: {default: {'primary': 'childId'}}
            };

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        xit('fails on invalid attributes in parentKey/childKey', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].parentKey = 'unknownId';
            resourceConfigs['test'].attributes['subResource'].childKey = 'id';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Unknown attribute "unknownId" in parentKey in sub-resource "test:subResource"');

            resourceConfigs['test'].attributes['subResource'].parentKey = 'id';
            resourceConfigs['test'].attributes['subResource'].childKey = 'unknownId';

            expect(function () {
                configParser(resourceConfigs, mockDataSources);
            }).to.throw(ImplementationError,
                'Unknown attribute "unknownId" in childKey in sub-resource "test:subResource"');
        });

        it('parses option "many"', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigs['test']);
            resourceConfigs['test'].attributes['subResource'].many = 'true';

            resourceConfigsParsed['test'].attributes['subResource'] = _.cloneDeep(minimalResourceConfigsParsed['test']);
            resourceConfigsParsed['test'].attributes['subResource'].many = true;

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
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
            resourceConfigsParsed['test'].attributes['subResource'].joinVia = 'joinTest';
            resourceConfigsParsed['test'].attributes['subResource'].dataSources['joinTest'] = {
                type: 'testDataSource',
                joinParentKey: [['parentId']],
                joinParentKeyResolved: ['parentIdDbField'],
                joinChildKey: [['childId']],
                joinChildKeyResolved: ['childIdDbField']
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

        it('fails if only joinParentKey or joinChildKey is defined', function () {
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
                'Attribute "parentId" not mapped to DataSource "joinTest" in joinParentKey in sub-resource "test:subResource"');

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
                'Attribute "childId" not mapped to DataSource "joinTest" in joinChildKey in sub-resource "test:subResource"');
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

        it('handles "value" option (no default mapping for static vaules) and parses "null" as null', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['dummy'] = {value: 'null'};
            resourceConfigsParsed['test'].attributes['dummy'] = {value: null, type: 'string'};
            // ... no "map" for "dummy" attribute and no "dummy" in expectedAttributes!

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        xit('parses option "depends" as Select-AST', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['copyright'] = {depends: 'author[firstname,lastname]', value: ''};
            resourceConfigsParsed['test'].attributes['copyright'] = {depends: {/* TODO */}, value: '', type: 'string'};

            configParser(resourceConfigs, mockDataSources);

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });

        it('parses option "internal"', function () {
            var resourceConfigs = _.cloneDeep(minimalResourceConfigs);
            var resourceConfigsParsed = _.cloneDeep(minimalResourceConfigsParsed);

            resourceConfigs['test'].attributes['dummy'] = {internal: 'true', value: ''};
            resourceConfigsParsed['test'].attributes['dummy'] = {internal: true, value: '', type: 'string'};

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
                ['articleId', 'categoryId'];
            resourceConfigs['article'].attributes['countries'].dataSources['primary'].expectedAttributes =
                ['id', 'name', 'iso', 'iso3'];
            resourceConfigs['article'].attributes['video'].dataSources['primary'].expectedAttributes =
                ['articleId', 'url', 'previewImage'];
            resourceConfigs['article'].attributes['comments'].dataSources['primary'].expectedAttributes =
                ['articleId', 'id', 'userId', 'content'];
            resourceConfigs['article'].attributes['comments'].dataSources['likes'].expectedAttributes =
                ['commentId', 'count'];
            resourceConfigs['user'].dataSources['primary'].expectedAttributes =
                ['id', 'firstname', 'lastname'];

            configParser(resourceConfigs, mockDataSources);

            // for manually generating fixture:
            //console.log(JSON.stringify(resourceConfigs, null, 4));

            expect(resourceConfigs).to.eql(resourceConfigsParsed);
        });
    });
});

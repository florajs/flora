'use strict';

var requestResolver = require('../lib/request-resolver');
var RequestError = require('flora-errors').RequestError;
var ImplementationError = require('flora-errors').ImplementationError;

var _ = require('lodash');
var expect = require('chai').expect;


describe('request-resolver', function () {
    var resourceConfigs = require('./fixtures/resources-parsed.json');

    describe('creation of resolved config (attribute tree)', function () {
        it('does not modify the original resourceConfigs tree', function () {
            var resourceConfigsBefore, resourceConfigsAfter;
            var req = {resource: 'article'};

            resourceConfigsBefore = JSON.stringify(resourceConfigs);
            requestResolver(req, resourceConfigs);
            resourceConfigsAfter = JSON.stringify(resourceConfigs);

            expect(resourceConfigsAfter).to.equal(resourceConfigsBefore);
        });

        it('handles resource-includes at top level (also recursive)', function () {
            var configs = {
                "resource1": {
                    "resource": "resource2"
                },
                "resource2": {
                    "resource": "real-resource"
                },
                "real-resource": resourceConfigs['user']
            };

            var req = {resource: 'resource1'};
            var resolvedRequest = requestResolver(req, configs);

            expect(resolvedRequest.resolvedConfig).to.have.deep.property('attributes.id');
        });

        it('fails on missing resource in request', function () {
            var req = {};

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Resource not specified in request');
        });

        it('fails on unknown resource in request', function () {
            var req = {resource: 'non-existing'};

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Unknown resource "non-existing" in request');
        });

        it('fails on unknown included resource with different error', function () {
            var configs = {
                "existing": {
                    "resource": "non-existing"
                }
            };

            var req = {resource: 'existing'};

            expect(function () {
                requestResolver(req, configs);
            }).to.throw(ImplementationError, 'Unknown resource "non-existing" (included from: existing -> non-existing)');
        });

        it('fails on unknown included sub-resource with different error', function () {
            var configs = {
                "existing": {
                    "dataSources": resourceConfigs['user'].dataSources,
                    "attributes": {
                        "existingAttribute": {
                            "resource": "non-existing"
                        }
                    }
                }
            };

            var req = {
                resource: 'existing',
                select: {
                    'existingAttribute': {}
                }
            };

            expect(function () {
                requestResolver(req, configs);
            }).to.throw(ImplementationError, 'Unknown resource "non-existing" at "existingAttribute"');
        });

        it('fails on endless recursion in resource-includes at top level', function () {
            var configs = {
                "resource1": {
                    "resource": "resource2"
                },
                "resource2": {
                    "resource": "resource1"
                }
            };

            var req = {resource: 'resource1'};

            expect(function () {
                requestResolver(req, configs);
            }).to.throw(ImplementationError, 'Resource inclusion depth too big (included from: resource1 -> resource2' /* ...) */);
        });

        it('fails if no DataSources defined at root', function () {
            var configs = _.cloneDeep(resourceConfigs);
            delete configs['article'].dataSources;

            var req = {resource: 'article'};

            expect(function () {
                requestResolver(req, configs);
            }).to.throw(ImplementationError, 'No DataSources defined in resource');
        });

        it('selects primary key in attribute tree automatically', function () {
            var req = {resource: 'article'};

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.resolvedConfig.attributes['id'].selected).to.be.true;
        });

        it('selects specified attribute in attribute tree', function () {
            var req = {
                resource: 'article',
                select: {
                    'title': {}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.resolvedConfig.attributes['title'].selected).to.be.true;
        });
    });

    describe('merging of included sub-resources', function () {
        var mergeResourceConfigs = {
            "resource1": {
                "primaryKey": [["id"]],
                "resolvedPrimaryKey": {"primary": ["id"]},
                "dataSources": {
                    "primary": {"type": "test"}
                },
                "attributes": {
                    "id": {
                        "type": "int",
                        "map": {"default": {"primary": "id"}}
                    },
                    "resource2": {
                        "resource": "resource2",
                        "parentKey": [["id"]],
                        "resolvedParentKey": {"primary": ["id"]},
                        "childKey": [["id"]],
                        "resolvedChildKey": {"primary": ["id"]}
                    }
                }
            },
            "resource2": {
                "primaryKey": [["id"]],
                "resolvedPrimaryKey": {"primary": ["id"]},
                "dataSources": {
                    "primary": {"type": "test"}
                },
                "attributes": {
                    "id": {
                        "type": "int",
                        "map": {"default": {"primary": "id"}}
                    },
                    "attr1": {
                        "map": {"default": {"primary": "attr1"}}
                    },
                    "attr2": {
                        "map": {"default": {"primary": "attr2"}}
                    }
                }
            }
        };

        var mergeRequest = {
            resource: 'resource1',
            select: {
                'resource2': {}
            }
        };

        it('allows additional attributes, but keeps order from sub-resource', function () {
            var configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].attributes['resource2'].attributes = {'attr3': {value: 'test'}};

            var expectedOrder = ['id', 'attr1', 'attr2', 'attr3'];

            var resolvedRequest = requestResolver(mergeRequest, configs);
            var currentOrder = Object.keys(resolvedRequest.resolvedConfig.attributes['resource2'].attributes);
            expect(currentOrder).to.eql(expectedOrder);
        });

        it('does not allow overwriting of attributes', function () {
            var configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].attributes['resource2'].attributes = {'attr1': {value: 'test'}};

            expect(function () {
                requestResolver(mergeRequest, configs);
            }).to.throw(ImplementationError, 'Cannot overwrite attribute "attr1" in "resource2"');
        });

        it('allows additional DataSources', function () {
            var configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].attributes['resource2'].dataSources = {'test': {type: 'test'}};

            var resolvedRequest = requestResolver(mergeRequest, configs);
            expect(resolvedRequest.resolvedConfig.attributes['resource2'].dataSources)
                .to.have.all.keys('primary', 'test');
        });

        it('does not allow overwriting of DataSources', function () {
            var configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].attributes['resource2'].dataSources = {'primary': {type: 'test'}};

            expect(function () {
                requestResolver(mergeRequest, configs);
            }).to.throw(ImplementationError, 'Cannot overwrite DataSource "primary" in "resource2"');
        });
    });

    describe('basic request resolving', function () {
        it('resolves minimal request', function () {
            // /article/
            var req = {
                resource: 'article',
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves request with id', function () {
            // /article/1
            var req = {
                resource: 'article',
                id: '1'
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [
                        [
                            {attribute: 'id', operator: 'equal', value: '1'}
                            // TODO: Type mapping of primaryKey value to defined type
                        ]
                    ]
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves request with select', function () {
            // /article/?select=title
            var req = {
                resource: 'article',
                select: {
                    'title': {}
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'title'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'},
                    'title': {type: 'string'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails when selecting unknown attributes', function () {
            // /article/?select=invalid
            var req = {
                resource: 'article',
                select: {
                    'invalid': {}
                }
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Unknown attribute "invalid" in request');
        });

        it('fails when selecting unknown sub-attributes', function () {
            // /article/?select=title.invalid
            var req = {
                resource: 'article',
                select: {
                    'title': {
                        select: {
                            'invalid': {}
                        }
                    }
                }
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Unknown attribute "title.invalid" in request');
        });

        it('fails when selecting hidden attributes', function () {
            // /article/?select=secretInfo
            var req = {
                resource: 'article',
                select: {
                    'secretInfo': {}
                }
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Unknown attribute "secretInfo" in request - it is a hidden attribute');
        });

        it('resolves request with filter', function () {
            // /article/?filter=id=2
            var req = {
                resource: 'article',
                filter: [
                    [
                        {attribute: ['id'], operator: 'equal', value: 2}
                    ]
                ]
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [
                        [
                            {attribute: 'id', operator: 'equal', value: 2}
                        ]
                    ],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails when filtering non-filterable attributes', function () {
            // /article/?filter=title=Test
            var req = {
                resource: 'article',
                filter: [
                    [
                        {attribute: ['title'], operator: 'equal', value: 'Test'}
                    ]
                ]
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Can not filter by attribute "title"');
        });

        it('fails when filtering attributes with unallowed operators', function () {
            // /article/?filter=date!=Test
            var req = {
                resource: 'article',
                filter: [
                    [
                        {attribute: ['date'], operator: 'notEqual', value: 'Test'}
                    ]
                ]
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Can not filter by attribute "date" with "notEqual" (allowed operators: greaterOrEqual, lessOrEqual)');
        });

        it('resolves request with search', function () {
            // /article/?search=test
            var req = {
                resource: 'article',
                search: 'test'
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'fulltextSearch',
                request: {
                    type: 'solr',
                    core: 'article',
                    searchable: 'true',
                    attributes: ['articleId'],
                    search: 'test',
                    limit: 10
                },
                attributeOptions: {
                    'articleId': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails on search when resource does not support it', function () {
            // /user/?search=test
            var req = {
                resource: 'user',
                search: 'test'
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Resource does not support fulltext-search');
        });

        it('resolves request with order', function () {
            // /article/?order=date:desc
            var req = {
                resource: 'article',
                order: [
                    {attribute: ['date'], direction: 'asc'}
                ]
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    order: [
                        {attribute: 'timestamp', direction: 'asc'}
                    ],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails when ordering by non-sortable attributes', function () {
            // /article/?order=title:desc
            var req = {
                resource: 'article',
                order: [
                    {attribute: ['title'], direction: 'asc'}
                ]
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Attribute "title" can not be ordered');
        });

        it('fails when ordering attributes in unallowed directions', function () {
            // /article/?order=date:topflop
            var req = {
                resource: 'article',
                order: [
                    {attribute: ['date'], direction: 'topflop'}
                ]
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Attribute "date" can not be ordered "topflop" (allowed: asc, desc)');
        });

        it('resolves request with limit', function () {
            // /article/?limit=100
            var req = {
                resource: 'article',
                limit: 100
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 100
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves request with limit/page', function () {
            // /article/?limit=50&page=2
            var req = {
                resource: 'article',
                limit: 50,
                page: 2
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 50,
                    page: 2
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails on request with page without limit', function () {
            // /article/?page=2
            var req = {
                resource: 'article',
                page: 2
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Always specify a fixed limit when requesting page');
        });
    });

    describe('limit, defaultLimit and maxLimit', function () {
        it('uses defaultLimit if no limit is given', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].defaultLimit = 42;

            var req = {
                resource: 'article'
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            resolvedRequest = resolvedRequest.dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 42);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('uses limit to override defaultLimit', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].defaultLimit = 42;

            var req = {
                resource: 'article',
                limit: 44
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            resolvedRequest = resolvedRequest.dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 44);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('uses maxLimit if no limit is given', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].maxLimit = 43;

            var req = {
                resource: 'article',
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            resolvedRequest = resolvedRequest.dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 43);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('uses defaultLimit even if maxLimit is given', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].maxLimit = 43;
            resourceConfigs2['article'].defaultLimit = 40;

            var req = {
                resource: 'article',
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            resolvedRequest = resolvedRequest.dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 40);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('uses limit if limit <= maxLimit', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].maxLimit = 45;

            var req = {
                resource: 'article',
                limit: 45
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            resolvedRequest = resolvedRequest.dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 45);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('fails if limit > maxLimit', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].maxLimit = 43;

            var req = {
                resource: 'article',
                limit: 44
            };

            expect(function () {
                requestResolver(req, resourceConfigs2);
            }).to.throw(RequestError, 'Invalid limit 44, maxLimit is 43');
        });

        it('allows limit = 0', function () {
            var req = {
                resource: 'article',
                limit: 0
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            resolvedRequest = resolvedRequest.dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 0);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('fails on limit on single resources', function () {
            var req = {
                resource: 'article',
                id: 1,
                limit: 2
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Invalid limit on a single resource');
        });
    });

    describe('limit, defaultLimit and maxLimit in sub-resources', function () {
        it('resolves "limitPer" inside a "many" relation', function () {
            var req = {
                resource: 'article',
                select: {
                    'comments': {
                        limit: 5
                    }
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            var resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 5);
            expect(resolvedSubRequest).to.have.property('limitPer', 'articleId');
        });

        it('uses defaultLimit if no limit is given', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].attributes['comments'].defaultLimit = 42;

            var req = {
                resource: 'article',
                id: 1,
                select: {
                    'comments': {}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            var resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 42);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('uses limit to override defaultLimit', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].attributes['comments'].defaultLimit = 42;

            var req = {
                resource: 'article',
                id: 1,
                select: {
                    'comments': {
                        limit: 44
                    }
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            var resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 44);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('uses maxLimit if no limit is given', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].attributes['comments'].maxLimit = 43;

            var req = {
                resource: 'article',
                id: 1,
                select: {
                    'comments': {}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            var resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 43);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('uses defaultLimit even if maxLimit is given', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].attributes['comments'].maxLimit = 43;
            resourceConfigs2['article'].attributes['comments'].defaultLimit = 40;

            var req = {
                resource: 'article',
                id: 1,
                select: {
                    'comments': {}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            var resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 40);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('uses limit if limit <= maxLimit', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].attributes['comments'].maxLimit = 45;

            var req = {
                resource: 'article',
                id: 1,
                select: {
                    'comments': {
                        limit: 45
                    }
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            var resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 45);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('fails if limit > maxLimit', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].attributes['comments'].maxLimit = 45;

            var req = {
                resource: 'article',
                id: 1,
                select: {
                    'comments': {
                        limit: 46
                    }
                }
            };

            expect(function () {
                requestResolver(req, resourceConfigs2);
            }).to.throw(RequestError, 'Invalid limit 46, maxLimit is 45 (in "comments")');
        });

        it('fails on limit on single sub-resources', function () {
            var req = {
                resource: 'article',
                id: 1,
                select: {
                    'author': {
                        limit: 2
                    }
                }
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Invalid limit on a single resource (in "author")');
        });
    });

    describe('defaultOrder', function () {
        it('uses defaultOrder if no order is given', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article']['defaultOrder'] = [{
                attribute: ['date'],
                direction: 'asc'
            }];

            // /article/
            var req = {
                resource: 'article'
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10,
                    order: [{attribute: "timestamp", direction: "asc"}]
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('uses order to override defaultOrder', function () {
            var resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article']['defaultOrder'] = [{
                attribute: ['date'],
                direction: 'asc'
            }];

            // /article/
            var req = {
                resource: 'article',
                order: [{
                    attribute: ['date'],
                    direction: 'desc'
                }]
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10,
                    order: [{attribute: "timestamp", direction: "desc"}]
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs2);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });
    });

    describe('high level error handling', function () {
        it('fails on "id"-option on sub-resource-nodes', function () {
            // /article/?select=comments(id=1)
            var req = {
                resource: 'article',
                select: {
                    'comments': {
                        id: 1
                    }
                }
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'ID option only allowed at root (in "comments")');
        });

        it('fails on sub-resource-options on non-resource-nodes', function () {
            // /article/?select=source(limit=20)
            var req = {
                resource: 'article',
                select: {
                    'source': {
                        limit: 20
                    }
                }
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Sub-Resource options not possible on "source"');

            // only "select" is allowed here (standard case):
            // /article/?select=source.name
            req = {
                resource: 'article',
                select: {
                    'source': {
                        select: {
                            'name': {}
                        }
                    }
                }
            };

            expect(function () {
                requestResolver(req, resourceConfigs);
            }).to.not.throw(Error);
        });
    });

    describe('request resolving with relations', function () {
        it('resolves selected sub-resource (1:1 relation - invisible primaryKey)', function () {
            // /article/?select=video.url
            var req = {
                resource: 'article',
                select: {
                    'video': {
                        select: {
                            'url': {}
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [
                    {
                        attributePath: ['video'],
                        dataSourceName: 'primary',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_video',
                            attributes: ['articleId', 'url'],
                            filter: [
                                [
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'articleId': {type: 'int'},
                            'url': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (1:n relation)', function () {
            // /article/?select=comments.content
            var req = {
                resource: 'article',
                select: {
                    'comments': {
                        select: {
                            'content': {}
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [
                    {
                        attributePath: ['comments'],
                        dataSourceName: 'primary',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: false,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_comment',
                            attributes: ['id', 'articleId', 'content'],
                            filter: [
                                [
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'},
                            'articleId': {type: 'int'},
                            'content': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (1:n relation) with secondary DataSource', function () {
            // /article/?select=comments[content,likes]
            var req = {
                resource: 'article',
                select: {
                    'comments': {
                        select: {
                            'content': {},
                            'likes': {}
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [
                    {
                        attributePath: ['comments'],
                        dataSourceName: 'primary',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: false,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_comment',
                            attributes: ['id', 'articleId', 'content'],
                            filter: [
                                [
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'},
                            'articleId': {type: 'int'},
                            'content': {type: 'string'}
                        },
                        subRequests: [
                            {
                                attributePath: ['comments'],
                                dataSourceName: 'likes',
                                parentKey: ['id'],
                                childKey: ['commentId'],
                                multiValuedParentKey: false,
                                uniqueChildKey: true,
                                request: {
                                    type: 'mysql',
                                    database: 'contents',
                                    table: 'comment_likes',
                                    attributes: ['commentId', 'count'],
                                    filter: [
                                        [
                                            {attribute: 'commentId', operator: 'equal', valueFromParentKey: true}
                                        ]
                                    ]
                                },
                                attributeOptions: {
                                    'commentId': {type: 'int'},
                                    'count': {type: 'int'}
                                }
                            }
                        ]
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (n:1 relation)', function () {
            // /article/?select=author[firstname,lastname]
            var req = {
                resource: 'article',
                select: {
                    'author': {
                        select: {
                            'firstname': {},
                            'lastname': {}
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'authorId'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'},
                    'authorId': {type: 'int'}
                },
                subRequests: [
                    {
                        resourceName: 'user',
                        attributePath: ['author'],
                        dataSourceName: 'primary',
                        parentKey: ['authorId'],
                        childKey: ['id'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'user',
                            attributes: ['id', 'firstname', 'lastname'],
                            filter: [
                                [
                                    {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'},
                            'firstname': {type: 'string'},
                            'lastname': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (m:n - with multi-values and delimiter)', function () {
            // /article/?select=countries.name
            var req = {
                resource: 'article',
                select: {
                    'countries': {
                        select: {
                            'name': {}
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'countries'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'},
                    'countries': {multiValued: true, type: 'string', delimiter: ','}
                },
                subRequests: [
                    {
                        attributePath: ['countries'],
                        dataSourceName: 'primary',
                        parentKey: ['countries'],
                        childKey: ['iso'],
                        multiValuedParentKey: true,
                        uniqueChildKey: true,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'country',
                            attributes: ['id', 'iso', 'name'],
                            filter: [
                                [
                                    {attribute: 'iso', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'},
                            'iso': {type: 'string'},
                            'name': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (m:n - with join-table + additional fields)', function () {
            // /article/?select=categories[name,order]
            var req = {
                resource: 'article',
                select: {
                    'categories': {
                        select: {
                            'name': {},
                            'order': {}
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [
                    {
                        attributePath: ['categories'],
                        dataSourceName: 'articleCategories',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: false,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_category',
                            attributes: ['articleId', 'categoryId', 'order'],
                            filter: [
                                [
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'articleId': {type: 'int'},
                            'categoryId': {type: 'int'},
                            'order': {type: 'int'}
                        },
                        subRequests: [
                            {
                                attributePath: ['categories'],
                                dataSourceName: 'primary',
                                parentKey: ['categoryId'],
                                childKey: ['id'],
                                multiValuedParentKey: false,
                                uniqueChildKey: true,
                                request: {
                                    type: 'mysql',
                                    database: 'contents',
                                    table: 'category',
                                    attributes: ['id', 'name'],
                                    filter: [
                                        [
                                            {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                                        ]
                                    ]
                                },
                                attributeOptions: {
                                    'id': {type: 'int'},
                                    'name': {type: 'string'}
                                }
                            }
                        ]
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('combines filter for selected sub-resource', function () {
            // /article/?select=comments(filter=id=3 OR id=4)
            var req = {
                resource: 'article',
                select: {
                    'comments': {
                        filter: [
                            [
                                {attribute: ['id'], operator: 'equal', value: 3}
                            ],
                            [
                                {attribute: ['id'], operator: 'equal', value: 4}
                            ]
                        ]
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [
                    {
                        attributePath: ['comments'],
                        dataSourceName: 'primary',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: false,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_comment',
                            attributes: ['id', 'articleId'],
                            filter: [
                                [
                                    {attribute: 'id', operator: 'equal', value: 3},
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ],
                                [
                                    {attribute: 'id', operator: 'equal', value: 4},
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'},
                            'articleId': {type: 'int'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });
    });

    describe('handling of dependencies', function () {
        it('selects dependant attributes internally (but not externally)', function () {
            var configs = _.cloneDeep(resourceConfigs);
            configs['article'].attributes['copyright'].depends =
                {'date': {}};

            // /article/?select=copyright
            var req = {
                resource: 'article',
                select: {
                    'copyright': {}
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'timestamp'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'},
                    'timestamp': {type: 'datetime'}
                }
            };

            var resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.
                attributes['date'].selected).not.to.be.true;
        });

        it('allows to depend on hidden attributes', function () {
            var configs = _.cloneDeep(resourceConfigs);
            configs['article'].attributes['copyright'].depends =
                {'secretInfo': {}};

            // /article/?select=copyright
            var req = {
                resource: 'article',
                select: {
                    'copyright': {}
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'secretInfo'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'},
                    'secretInfo': {type: 'string'}
                }
            };

            var resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.
                attributes['secretInfo'].selected).not.to.be.true;
        });

        it('selects dependant sub-resources internally', function () {
            var configs = _.cloneDeep(resourceConfigs);
            configs['article'].attributes['copyright'].depends =
                {'author': {select: {'firstname': {}, 'lastname': {}}}};

            // /article/?select=copyright
            var req = {
                resource: 'article',
                select: {
                    'copyright': {}
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'authorId'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'},
                    'authorId': {type: 'int'}
                },
                subRequests: [
                    {
                        resourceName: 'user',
                        attributePath: ['author'],
                        dataSourceName: 'primary',
                        parentKey: ['authorId'],
                        childKey: ['id'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'user',
                            attributes: ['id', 'firstname', 'lastname'],
                            filter: [
                                [
                                    {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'},
                            'firstname': {type: 'string'},
                            'lastname': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.
                attributes['author'].selected).not.to.be.true;
        });

        it('handles "depends" + "select" on same sub-resource', function () {
            var configs = _.cloneDeep(resourceConfigs);
            configs['article'].attributes['copyright'].depends =
                {'author': {select: {'firstname': {}, 'lastname': {}}}};

            // /article/?select=copyright,author.firstname
            var req = {
                resource: 'article',
                select: {
                    'copyright': {},
                    'author': {select: {'firstname': {}}}
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'authorId'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'},
                    'authorId': {type: 'int'}
                },
                subRequests: [
                    {
                        resourceName: 'user',
                        attributePath: ['author'],
                        dataSourceName: 'primary',
                        parentKey: ['authorId'],
                        childKey: ['id'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'user',
                            attributes: ['id', 'firstname', 'lastname'],
                            filter: [
                                [
                                    {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'},
                            'firstname': {type: 'string'},
                            'lastname': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.
                attributes['author'].selected).to.be.true;
            expect(resolvedRequest.resolvedConfig.
                attributes['author'].attributes['firstname'].selected).to.be.true;
            expect(resolvedRequest.resolvedConfig.
                attributes['author'].attributes['lastname'].selected).not.to.be.true;
        });
    });

    describe('handling of multiple DataSources per resource', function () {
        it('resolves selected field from Sub-DataSource', function () {
            // /article/?select=body
            var req = {
                resource: 'article',
                select: {
                    'body': {}
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [
                    {
                        attributePath: [],
                        dataSourceName: 'articleBody',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_body',
                            attributes: ['articleId', 'body'],
                            filter: [
                                [
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'articleId': {type: 'int'},
                            'body': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves parentKey in secondary DataSources', function () {
            // /article/?select=author&search=test
            var req = {
                resource: 'article',
                select: {
                    'author': {
                        select: {
                            'firstname': {},
                            'lastname': {}
                        }
                    }
                },
                search: 'test'
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'fulltextSearch',
                request: {
                    type: 'solr',
                    core: 'article',
                    searchable: 'true',
                    attributes: ['articleId'],
                    search: 'test',
                    limit: 10
                },
                attributeOptions: {
                    'articleId': {type: 'int'}
                },
                subRequests: [{
                    attributePath: [],
                    dataSourceName: 'primary',
                    parentKey: ['articleId'],
                    childKey: ['id'],
                    multiValuedParentKey: false,
                    uniqueChildKey: true,
                    request: {
                        type: 'mysql',
                        database: 'contents',
                        table: 'article',
                        attributes: ['id', 'authorId'],
                        filter: [
                            [
                                {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                            ]
                        ]
                    },
                    attributeOptions: {
                        'id': {type: 'int'},
                        'authorId': {type: 'int'}
                    },
                    subRequests: [
                        {
                            resourceName: 'user',
                            attributePath: ['author'],
                            dataSourceName: 'primary',
                            parentKey: ['authorId'],
                            childKey: ['id'],
                            multiValuedParentKey: false,
                            uniqueChildKey: true,
                            request: {
                                type: 'mysql',
                                database: 'contents',
                                table: 'user',
                                attributes: ['id', 'firstname', 'lastname'],
                                filter: [
                                    [
                                        {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                                    ]
                                ]
                            },
                            attributeOptions: {
                                'id': {type: 'int'},
                                'firstname': {type: 'string'},
                                'lastname': {type: 'string'}
                            }
                        }
                    ]
                }]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['author'].parentDataSource).to.equal('primary');
        });
    });

    describe('handling of composite primary keys', function () {
        it('resolves composite primaryKey linked by non-composite key', function () {
            // /article/?select=versions.title
            var req = {
                resource: 'article',
                select: {
                    'versions': {
                        select: {
                            'title': {}
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [
                    {
                        attributePath: ['versions'],
                        dataSourceName: 'primary',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: false,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_versions',
                            attributes: ['articleId', 'versionId', 'title'],
                            filter: [
                                [
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'articleId': {type: 'int'},
                            'versionId': {type: 'int'},
                            'title': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves composite parentKey/childKey', function () {
            // /article/?select=versions.versioninfo.modified
            var req = {
                resource: 'article',
                select: {
                    'versions': {
                        select: {
                            'versioninfo': {
                                select: {
                                    'modified': {}
                                }
                            }
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [
                    {
                        attributePath: ['versions'],
                        dataSourceName: 'primary',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: false,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_versions',
                            attributes: ['articleId', 'versionId'],
                            filter: [
                                [
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'articleId': {type: 'int'},
                            'versionId': {type: 'int'}
                        },
                        subRequests: [
                            {
                                attributePath: ['versions', 'versioninfo'],
                                dataSourceName: 'primary',
                                parentKey: ['articleId', 'versionId'],
                                childKey: ['articleId', 'versionId'],
                                multiValuedParentKey: false,
                                uniqueChildKey: true,
                                request: {
                                    type: 'mysql',
                                    database: 'contents',
                                    table: 'article_versioninfo',
                                    attributes: ['articleId', 'versionId', 'modified'],
                                    filter: [
                                        [
                                            {attribute: ['articleId', 'versionId'], operator: 'equal', valueFromParentKey: true}
                                        ]
                                    ]
                                },
                                attributeOptions: {
                                    'articleId': {type: 'int'},
                                    'versionId': {type: 'int'},
                                    'modified': {type: 'datetime'}
                                }
                            }
                        ]
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });
    });

    describe('filter by sub-resources', function () {
        it('resolves filter by sub-resource primary key without "rewriteTo"', function () {
            var configs = _.cloneDeep(resourceConfigs);
            delete configs['article'].subFilters[0].rewriteTo;

            // /article/?filter=author.id=11,12,13
            var req = {
                resource: 'article',
                filter: [
                    [
                        {attribute: ['author', 'id'], operator: 'equal', value: [11, 12, 13]}
                    ]
                ]
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [
                        [
                            {attribute: 'authorId', operator: 'equal', valueFromSubFilter: true}
                        ]
                    ],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subFilters: [{
                    parentKey: ['authorId'],
                    childKey: ['id'],
                    request: {
                        type: 'mysql',
                        database: 'contents',
                        table: 'user',
                        attributes: ['id'],
                        filter: [
                            [
                                {attribute: 'id', operator: 'equal', value: [11, 12, 13]}
                            ]
                        ]
                    },
                    attributeOptions: {
                        'id': {type: 'int'}
                    }
                }]
            };

            var resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves filter by sub-resource primary key with "rewriteTo"', function () {
            // /article/?filter=author.id=11,12,13
            var req = {
                resource: 'article',
                filter: [
                    [
                        {attribute: ['author', 'id'], operator: 'equal', value: [11, 12, 13]}
                    ]
                ]
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [
                        [
                            {attribute: 'authorId', operator: 'equal', value: [11, 12, 13]}
                        ]
                    ],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                }
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves filter by sub-resource-attribute', function () {
            // /article/?filter=video.youtubeId="xyz123"
            var req = {
                resource: 'article',
                filter: [
                    [
                        {attribute: ['video', 'youtubeId'], operator: 'equal', value: 'xyz123'}
                    ]
                ]
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [
                        [
                            {attribute: 'id', operator: 'equal', valueFromSubFilter: true}
                        ]
                    ],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subFilters: [{
                    parentKey: ['id'],
                    childKey: ['articleId'],
                    request: {
                        type: 'mysql',
                        database: 'contents',
                        table: 'article_video',
                        attributes: ['articleId'],
                        filter: [
                            [
                                {attribute: 'youtubeId', operator: 'equal', value: 'xyz123'}
                            ]
                        ]
                    },
                    attributeOptions: {
                        'articleId': {type: 'int'}
                    }
                }]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves filter by sub-sub-resource', function () {
            // /article/?filter=comments.user.id=123
            var req = {
                resource: 'article',
                filter: [
                    [
                        {attribute: ['comments', 'user', 'id'], operator: 'equal', value: 123}
                    ]
                ]
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [
                        [
                            {attribute: 'id', operator: 'equal', valueFromSubFilter: true}
                        ]
                    ],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subFilters: [{
                    parentKey: ['id'],
                    childKey: ['articleId'],
                    request: {
                        type: 'mysql',
                        database: 'contents',
                        table: 'article_comment',
                        attributes: ['articleId'],
                        filter: [
                            [
                                {attribute: 'userId', operator: 'equal', valueFromSubFilter: true}
                            ]
                        ]
                    },
                    attributeOptions: {
                        'articleId': {type: 'int'}
                    },
                    subFilters: [{
                        parentKey: ['userId'],
                        childKey: ['id'],
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'user',
                            attributes: ['id'],
                            filter: [
                                [
                                    {attribute: 'id', operator: 'equal', value: 123}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'}
                        }
                    }]
                }]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves filter by sub-resource with joinVia', function () {
            // /article/?filter=categories.id=1234
            var req = {
                resource: 'article',
                filter: [
                    [
                        {attribute: ['categories', 'id'], operator: 'equal', value: 1234}
                    ]
                ]
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [
                        [
                            {attribute: 'id', operator: 'equal', valueFromSubFilter: true}
                        ]
                    ],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subFilters: [{
                    parentKey: ['id'],
                    childKey: ['articleId'],
                    request: {
                        type: 'mysql',
                        database: 'contents',
                        table: 'article_category',
                        joinParentKey: [['articleId']],
                        joinChildKey: [['categoryId']],
                        resolvedJoinParentKey: ['articleId'],
                        resolvedJoinChildKey: ['categoryId'],
                        attributes: ['articleId'],
                        filter: [
                            [
                                {attribute: 'categoryId', operator: 'equal', valueFromSubFilter: true}
                            ]
                        ]
                    },
                    attributeOptions: {
                        'articleId': {type: 'int'}
                    },
                    subFilters: [{
                        parentKey: ['categoryId'],
                        childKey: ['id'],
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'category',
                            attributes: ['id'],
                            filter: [
                                [
                                    {attribute: 'id', operator: 'equal', value: 1234}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'}
                        }
                    }]
                }]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });
    });

    describe('complex request resolving', function () {
        it('resolves two overlapping composite parentKeys in different secondary DataSources', function () {
            var testResourceConfigs = {
                "resource1": {
                    "primaryKey": [["id"]],
                    "resolvedPrimaryKey": {"primary": ["id"], "secondary1": ["id"], "secondary2": ["id"]},
                    "dataSources": {
                        "primary": {"type": "test"},
                        "secondary1": {"type": "test"},
                        "secondary2": {"type": "test"}
                    },
                    "attributes": {
                        "id": {
                            "type": "int",
                            "map": {"default": {"primary": "id", "secondary1": "id", "secondary2": "id"}}
                        },
                        "firstKeyPart": {
                            "type": "int",
                            "map": {"default": {"secondary1": "firstKeyPart", "secondary2": "firstKeyPart"}}
                        },
                        "keyPart1": {
                            "type": "int",
                            "map": {"default": {"secondary1": "keyPart1"}}
                        },
                        "keyPart2": {
                            "type": "int",
                            "map": {"default": {"secondary2": "keyPart2"}}
                        },
                        "subResource1": {
                            "primaryKey": [["firstKeyPart"], ["keyPart1"]],
                            "resolvedPrimaryKey": {"primary": ["firstKeyPart", "keyPart1"]},
                            "parentKey": [["firstKeyPart"], ["keyPart1"]],
                            "resolvedParentKey": {"secondary1": ["firstKeyPart", "keyPart1"]},
                            "childKey": [["firstKeyPart"], ["keyPart1"]],
                            "resolvedChildKey": {"primary": ["firstKeyPart", "keyPart1"]},
                            "dataSources": {
                                "primary": {"type": "test"}
                            },
                            "attributes": {
                                "firstKeyPart": {
                                    "type": "int",
                                    "map": {"default": {"primary": "firstKeyPart"}}
                                },
                                "keyPart1": {
                                    "type": "int",
                                    "map": {"default": {"primary": "keyPart1"}}
                                },
                                "name": {
                                    "type": "string",
                                    "map": {"default": {"primary": "name"}}
                                }
                            }
                        },
                        "subResource2": {
                            "primaryKey": [["firstKeyPart"], ["keyPart2"]],
                            "resolvedPrimaryKey": {"primary": ["firstKeyPart", "keyPart2"]},
                            "parentKey": [["firstKeyPart"], ["keyPart2"]],
                            "resolvedParentKey": {"secondary2": ["firstKeyPart", "keyPart2"]},
                            "childKey": [["firstKeyPart"], ["keyPart2"]],
                            "resolvedChildKey": {"primary": ["firstKeyPart", "keyPart2"]},
                            "dataSources": {
                                "primary": {"type": "test"}
                            },
                            "attributes": {
                                "firstKeyPart": {
                                    "type": "int",
                                    "map": {"default": {"primary": "firstKeyPart"}}
                                },
                                "keyPart2": {
                                    "type": "int",
                                    "map": {"default": {"primary": "keyPart2"}}
                                },
                                "name": {
                                    "type": "string",
                                    "map": {"default": {"primary": "name"}}
                                }
                            }
                        }
                    }
                }
            };

            // /resource1/?select=subResource1.name,subResource2.name
            var req = {
                resource: 'resource1',
                select: {
                    'subResource1': {
                        select: {
                            'name': {}
                        }
                    },
                    'subResource2': {
                        select: {
                            'name': {}
                        }
                    }
                }
            };

            var dataSourceTree = {
                resourceName: 'resource1',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'test',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    'id': {type: 'int'}
                },
                subRequests: [{
                    attributePath: [],
                    dataSourceName: 'secondary1',
                    parentKey: ['id'],
                    childKey: ['id'],
                    multiValuedParentKey: false,
                    uniqueChildKey: true,
                    request: {
                        type: 'test',
                        attributes: ['id', 'firstKeyPart', 'keyPart1'],
                        filter: [
                            [
                                {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                            ]
                        ]
                    },
                    attributeOptions: {
                        'id': {type: 'int'},
                        'firstKeyPart': {type: 'int'},
                        'keyPart1': {type: 'int'}
                    },
                    subRequests: [
                        {
                            attributePath: ['subResource1'],
                            dataSourceName: 'primary',
                            parentKey: ['firstKeyPart', 'keyPart1'],
                            childKey: ['firstKeyPart', 'keyPart1'],
                            multiValuedParentKey: false,
                            uniqueChildKey: true,
                            request: {
                                type: 'test',
                                attributes: ['firstKeyPart', 'keyPart1', 'name'],
                                filter: [
                                    [
                                        {attribute: ['firstKeyPart', 'keyPart1'], operator: 'equal', valueFromParentKey: true}
                                    ]
                                ]
                            },
                            attributeOptions: {
                                'firstKeyPart': {type: 'int'},
                                'keyPart1': {type: 'int'},
                                'name': {type: 'string'}
                            }
                        }
                    ]
                },{
                    attributePath: [],
                    dataSourceName: 'secondary2',
                    parentKey: ['id'],
                    childKey: ['id'],
                    multiValuedParentKey: false,
                    uniqueChildKey: true,
                    request: {
                        type: 'test',
                        attributes: ['id', 'firstKeyPart', 'keyPart2'],
                        filter: [
                            [
                                {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                            ]
                        ]
                    },
                    attributeOptions: {
                        'id': {type: 'int'},
                        'firstKeyPart': {type: 'int'},
                        'keyPart2': {type: 'int'}
                    },
                    subRequests: [
                        {
                            attributePath: ['subResource2'],
                            dataSourceName: 'primary',
                            parentKey: ['firstKeyPart', 'keyPart2'],
                            childKey: ['firstKeyPart', 'keyPart2'],
                            multiValuedParentKey: false,
                            uniqueChildKey: true,
                            request: {
                                type: 'test',
                                attributes: ['firstKeyPart', 'keyPart2', 'name'],
                                filter: [
                                    [
                                        {attribute: ['firstKeyPart', 'keyPart2'], operator: 'equal', valueFromParentKey: true}
                                    ]
                                ]
                            },
                            attributeOptions: {
                                'firstKeyPart': {type: 'int'},
                                'keyPart2': {type: 'int'},
                                'name': {type: 'string'}
                            }
                        }
                    ]
                }]
            };

            var resolvedRequest = requestResolver(req, testResourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['subResource1'].parentDataSource).to.equal('secondary1');
            expect(resolvedRequest.resolvedConfig.attributes['subResource2'].parentDataSource).to.equal('secondary2');
        });

        it('resolves full-featured request', function () {
            // /article/?
            // select=date,title,subTitle,source[name,externalId],body,author[firstname,lastname]&
            // filter=date<=2014-12-01T00:00:00%2B01:00 AND categories.id=12,13&
            // order=date:desc&
            // limit=10&
            // page=1
            var req = {
                resource: 'article',
                select: {
                    'date': {},
                    'title': {},
                    'subTitle': {},
                    'source': {
                        select: {
                            'name': {},
                            'externalId': {}
                        }
                    },
                    'body': {},
                    'author': {
                        select: {
                            'firstname': {},
                            'lastname': {}
                        }
                    }
                },
                filter: [
                    [
                        {attribute: ['date'], operator: 'lessOrEqual', value: '2014-12-01T00:00:00+01:00'},
                        {attribute: ['categories', 'id'], operator: 'equal', value: [12, 13]}
                    ]
                ],
                order: [{
                    attribute: ['date'],
                    direction: 'desc'
                }],
                limit: 10,
                page: 1
            };

            var dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'timestamp', 'title', 'sourceName', 'externalId', 'authorId'],
                    filter: [
                        [
                            {attribute: 'timestamp', operator: 'lessOrEqual', value: '2014-12-01T00:00:00+01:00'},
                            {attribute: 'id', operator: 'equal', valueFromSubFilter: true}
                        ]
                    ],
                    order: [{
                        attribute: 'timestamp',
                        direction: 'desc'
                    }],
                    limit: 10,
                    page: 1
                },
                attributeOptions: {
                    'id': {type: 'int'},
                    'timestamp': {type: 'datetime'},
                    'title': {type: 'string'},
                    'sourceName': {type: 'string'},
                    'externalId': {type: 'string'},
                    'authorId': {type: 'int'}
                },
                subFilters: [{
                    parentKey: ['id'],
                    childKey: ['articleId'],
                    request: {
                        type: 'mysql',
                        database: 'contents',
                        table: 'article_category',
                        joinParentKey: [['articleId']],
                        joinChildKey: [['categoryId']],
                        resolvedJoinParentKey: ['articleId'],
                        resolvedJoinChildKey: ['categoryId'],
                        attributes: ['articleId'],
                        filter: [
                            [
                                {attribute: 'categoryId', operator: 'equal', valueFromSubFilter: true}
                            ]
                        ]
                    },
                    attributeOptions: {
                        'articleId': {type: 'int'}
                    },
                    subFilters: [{
                        parentKey: ['categoryId'],
                        childKey: ['id'],
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'category',
                            attributes: ['id'],
                            filter: [
                                [
                                    {attribute: 'id', operator: 'equal', value: [12, 13]}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'}
                        }
                    }]
                }],
                subRequests: [
                    {
                        attributePath: [],
                        dataSourceName: 'articleBody',
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_body',
                            attributes: ['articleId', 'body'],
                            filter: [
                                [
                                    {attribute: 'articleId', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'articleId': {type: 'int'},
                            'body': {type: 'string'}
                        }
                    },
                    {
                        resourceName: 'user',
                        attributePath: ['author'],
                        dataSourceName: 'primary',
                        parentKey: ['authorId'],
                        childKey: ['id'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'user',
                            attributes: ['id', 'firstname', 'lastname'],
                            filter: [
                                [
                                    {attribute: 'id', operator: 'equal', valueFromParentKey: true}
                                ]
                            ]
                        },
                        attributeOptions: {
                            'id': {type: 'int'},
                            'firstname': {type: 'string'},
                            'lastname': {type: 'string'}
                        }
                    }
                ]
            };

            var resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves resolved-config.json fixture correctly', function () {
            // /article/?select=date,title,subTitle,author[firstname,lastname],
            //     categories[name,order],countries.name,body,video.url,
            //     source[name,externalId],comments[content,user[firstname,lastname]],
            //     versions[title,versioninfo.modified]
            var req = {
                resource: 'article',
                select: {
                    'date': {},
                    'title': {},
                    'subTitle': {},
                    'author': {
                        select: {
                            'firstname': {},
                            'lastname': {}
                        }
                    },
                    'categories': {
                        select: {
                            'name': {},
                            'order': {}
                        }
                    },
                    'countries': {
                        select: {
                            'name': {}
                        }
                    },
                    'body': {},
                    'video': {
                        select: {
                            'url': {}
                        }
                    },
                    'source': {
                        select: {
                            'name': {},
                            'externalId': {}
                        }
                    },
                    'comments': {
                        select: {
                            'content': {},
                            'user': {
                                select: {
                                    'firstname': {},
                                    'lastname': {}
                                }
                            }
                        }
                    },
                    'versions': {
                        select: {
                            'title': {},
                            'versioninfo': {
                                select: {
                                    'modified': {}
                                }
                            }
                        }
                    }
                }
            };

            var resolvedConfig = require('./fixtures/resolved-config.json');

            var resolvedRequest = requestResolver(req, resourceConfigs);

            function deselectAttributes(parentAttrNode) {
                var attrName, attrNode;

                for (attrName in parentAttrNode.attributes) {
                    attrNode = parentAttrNode.attributes[attrName];

                    if (attrNode.attributes) {
                        deselectAttributes(attrNode);
                    }

                    if (attrNode.selected) {
                        attrNode.selected = false;
                    }
                }
            }

            deselectAttributes(resolvedRequest.resolvedConfig);

            // for manually generating fixture:
            //console.log(JSON.stringify(resolvedRequest.resolvedConfig, null, 4));

            expect(resolvedRequest.resolvedConfig).to.eql(resolvedConfig);
        });
    });
});

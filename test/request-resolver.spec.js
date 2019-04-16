/* global describe, it */

'use strict';

const _ = require('lodash');
const { expect } = require('chai');
const { RequestError, ImplementationError } = require('flora-errors');

const requestResolver = require('../lib/request-resolver');

describe('request-resolver', () => {
    let resourceConfigs = require('./fixtures/resources-parsed.json');

    describe('creation of resolved config (attribute tree)', () => {
        it('does not modify the original resourceConfigs tree', () => {
            const req = { resource: 'article' };

            const resourceConfigsBefore = JSON.stringify(resourceConfigs);
            requestResolver(req, resourceConfigs);
            const resourceConfigsAfter = JSON.stringify(resourceConfigs);

            expect(resourceConfigsAfter).to.equal(resourceConfigsBefore);
        });

        it('returns a completely cloned resourceConfigs tree (except DataSources)', () => {
            const req = {
                resource: 'article',
                select: {
                    title: {},
                    author: {
                        select: {
                            firstname: {}
                        }
                    },
                    categories: {},
                    comments: {
                        select: {
                            content: {},
                            user: {
                                select: {
                                    firstname: {}
                                }
                            }
                        }
                    }
                }
            };

            function polluteObject(object, depth) {
                for (const key in object) {
                    if (key === '_attrsRefs') continue;

                    if (typeof object[key] === 'object' && object[key] !== null && depth > 0) {
                        polluteObject(object[key], key === 'dataSources' ? 1 : depth - 1);
                    }
                }

                object.__garbage__ = true;
            }

            const resourceConfigsBefore = JSON.stringify(resourceConfigs);
            const resolvedRequest = requestResolver(req, resourceConfigs);
            polluteObject(resolvedRequest.resolvedConfig, 100);
            const resourceConfigsAfter = JSON.stringify(resourceConfigs);

            expect(resourceConfigsAfter).to.equal(resourceConfigsBefore);
        });

        it('handles resource-includes at top level (also recursive)', () => {
            const configs = {
                resource1: {
                    config: { resource: 'resource2' }
                },
                resource2: {
                    config: { resource: 'real-resource' }
                },
                'real-resource': resourceConfigs['user']
            };

            const req = { resource: 'resource1' };
            const resolvedRequest = requestResolver(req, configs);

            expect(resolvedRequest.resolvedConfig).to.have.nested.property('attributes.id');
        });

        it('fails on missing resource in request', () => {
            const req = {};

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Resource not specified');
        });

        it('fails on unknown resource in request', () => {
            const req = { resource: 'non-existing' };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Unknown resource "non-existing"');
        });

        it('fails on unknown included resource with different error', () => {
            const configs = {
                existing: {
                    config: { resource: 'non-existing' }
                }
            };

            const req = { resource: 'existing' };

            expect(() => {
                requestResolver(req, configs);
            }).to.throw(
                ImplementationError,
                'Unknown resource "non-existing" (included from: existing -> non-existing)'
            );
        });

        it('fails on unknown included sub-resource with different error', () => {
            const configs = {
                existing: {
                    config: {
                        dataSources: resourceConfigs['user'].config.dataSources,
                        attributes: {
                            existingAttribute: {
                                resource: 'non-existing'
                            }
                        }
                    }
                }
            };

            const req = {
                resource: 'existing',
                select: {
                    existingAttribute: {}
                }
            };

            expect(() => {
                requestResolver(req, configs);
            }).to.throw(ImplementationError, 'Unknown resource "non-existing" at "existingAttribute"');
        });

        it('fails on endless recursion in resource-includes at top level', () => {
            const configs = {
                resource1: {
                    config: { resource: 'resource2' }
                },
                resource2: {
                    config: { resource: 'resource1' }
                }
            };

            const req = { resource: 'resource1' };

            expect(() => {
                requestResolver(req, configs);
            }).to.throw(
                ImplementationError,
                'Resource inclusion depth too big (included from: resource1 -> resource2' /* ...) */
            );
        });

        it('fails if no DataSources defined at root', () => {
            const configs = _.cloneDeep(resourceConfigs);
            delete configs['article'].config.dataSources;

            const req = { resource: 'article' };

            expect(() => {
                requestResolver(req, configs);
            }).to.throw(ImplementationError, 'No DataSources defined in resource');
        });

        it('selects primary key in attribute tree automatically', () => {
            const req = { resource: 'article' };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.resolvedConfig.attributes['id'].selected).to.be.true;
        });

        it('selects specified attribute in attribute tree', () => {
            const req = {
                resource: 'article',
                select: {
                    title: {}
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.resolvedConfig.attributes['title'].selected).to.be.true;
        });
    });

    describe('merging of included sub-resources', () => {
        const mergeResourceConfigs = {
            resource1: {
                config: {
                    primaryKey: [['id']],
                    resolvedPrimaryKey: { primary: ['id'] },
                    dataSources: {
                        primary: { type: 'test' }
                    },
                    attributes: {
                        id: {
                            type: 'int',
                            map: { default: { primary: 'id' } }
                        },
                        resource2: {
                            resource: 'resource2',
                            parentKey: [['id']],
                            resolvedParentKey: { primary: ['id'] },
                            childKey: [['id']],
                            resolvedChildKey: { primary: ['id'] }
                        }
                    }
                }
            },
            resource2: {
                config: {
                    primaryKey: [['id']],
                    resolvedPrimaryKey: { primary: ['id'] },
                    dataSources: {
                        primary: { type: 'test' }
                    },
                    attributes: {
                        id: {
                            type: 'int',
                            map: { default: { primary: 'id' } }
                        },
                        attr1: {
                            map: { default: { primary: 'attr1' } }
                        },
                        attr2: {
                            map: { default: { primary: 'attr2' } }
                        }
                    }
                }
            }
        };

        it('allows additional attributes and keeps order from request', () => {
            const configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].config.attributes['resource2'].attributes = { attr3: { value: 'test' } };

            const req = {
                resource: 'resource1',
                select: {
                    resource2: {
                        select: { attr3: {}, attr2: {}, attr1: {} }
                    }
                }
            };

            const expectedOrder = ['id', 'attr3', 'attr2', 'attr1'];

            const resolvedRequest = requestResolver(req, configs);
            const currentOrder = Object.keys(resolvedRequest.resolvedConfig.attributes['resource2'].attributes);
            expect(currentOrder).to.eql(expectedOrder);
        });

        it('does not allow overwriting of attributes', () => {
            const configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].config.attributes['resource2'].attributes = { attr1: { value: 'test' } };

            const req = {
                resource: 'resource1',
                select: {
                    resource2: {
                        select: { attr1: {} }
                    }
                }
            };

            expect(() => {
                requestResolver(req, configs);
            }).to.throw(ImplementationError, 'Cannot overwrite attribute "attr1" in "resource2"');
        });

        it('allows additional DataSources', () => {
            const configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].config.attributes['resource2'].dataSources = { test: { type: 'test' } };
            // TODO: Currently "map" is not mergeable - maybe future feature - hack for now for this test:
            configs['resource2'].config.resolvedPrimaryKey['test'] = ['id'];
            configs['resource2'].config.attributes['id'].map['default']['test'] = 'id';
            configs['resource2'].config.attributes['attr1'].map['default'] = { test: 'attr1' };

            const req = {
                resource: 'resource1',
                select: {
                    resource2: {
                        select: { attr1: {} }
                    }
                }
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.resolvedConfig.attributes['resource2'].dataSources).to.have.all.keys(
                'primary',
                'test'
            );
        });

        it('does not allow overwriting of DataSources', () => {
            const configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].config.attributes['resource2'].dataSources = { primary: { type: 'test' } };

            const req = {
                resource: 'resource1',
                select: {
                    resource2: {}
                }
            };

            expect(() => {
                requestResolver(req, configs);
            }).to.throw(ImplementationError, 'Cannot overwrite DataSource "primary" in "resource2"');
        });

        it('does allow overwriting of DataSources with "inherit=inherit" flag', () => {
            const configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].config.dataSources = { primary: { customFlag: 'default' } };
            configs['resource1'].config.attributes['resource2'].dataSources = {
                primary: { inherit: 'inherit', customFlag: 'overwritten' }
            };

            const req = {
                resource: 'resource1',
                select: {
                    resource2: {}
                }
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.resolvedConfig.attributes['resource2'].dataSources.primary.type).to.equal('test');
            expect(resolvedRequest.resolvedConfig.attributes['resource2'].dataSources.primary.customFlag).to.equal(
                'overwritten'
            );
        });

        it('does allow overwriting of DataSources with "inherit=replace" flag', () => {
            const configs = _.cloneDeep(mergeResourceConfigs);
            configs['resource1'].config.dataSources = { primary: { customFlag: 'default', otherFlag: 'hello' } };
            configs['resource1'].config.attributes['resource2'].dataSources = {
                primary: { type: 'test2', inherit: 'replace', customFlag: 'overwritten' }
            };

            const req = {
                resource: 'resource1',
                select: {
                    resource2: {}
                }
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.resolvedConfig.attributes['resource2'].dataSources.primary.type).to.equal('test2');
            expect(resolvedRequest.resolvedConfig.attributes['resource2'].dataSources.primary.customFlag).to.equal(
                'overwritten'
            );
            expect(resolvedRequest.resolvedConfig.attributes['resource2'].dataSources.primary.otherFlag).to.be
                .undefined;
        });
    });

    describe('basic request resolving', () => {
        it('resolves minimal request', () => {
            // /article/
            const req = {
                resource: 'article'
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves request with id', () => {
            // /article/1
            const req = {
                resource: 'article',
                id: '1'
            };

            const dataSourceTree = {
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
                            { attribute: 'id', operator: 'equal', value: '1' }
                            // TODO: Type mapping of primaryKey value to defined type
                        ]
                    ]
                },
                attributeOptions: {
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves request with select', () => {
            // /article/?select=title
            const req = {
                resource: 'article',
                select: {
                    title: {}
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' },
                    title: { type: 'string' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails when selecting unknown attributes', () => {
            // /article/?select=invalid
            const req = {
                resource: 'article',
                select: {
                    invalid: {}
                }
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Unknown attribute "invalid"');
        });

        it('fails when selecting unknown sub-attributes', () => {
            // /article/?select=title.invalid
            const req = {
                resource: 'article',
                select: {
                    title: {
                        select: {
                            invalid: {}
                        }
                    }
                }
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Unknown attribute "title.invalid"');
        });

        it('fails when selecting hidden attributes', () => {
            // /article/?select=secretInfo
            const req = {
                resource: 'article',
                select: {
                    secretInfo: {}
                }
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Unknown attribute "secretInfo" - it is a hidden attribute');
        });

        it('resolves request with filter', () => {
            // /article/?filter=id=2
            const req = {
                resource: 'article',
                filter: [[{ attribute: ['id'], operator: 'equal', value: 2 }]]
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [[{ attribute: 'id', operator: 'equal', value: 2 }]],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails when filtering non-filterable attributes', () => {
            // /article/?filter=title=Test
            const req = {
                resource: 'article',
                filter: [[{ attribute: ['title'], operator: 'equal', value: 'Test' }]]
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Can not filter by attribute "title"');
        });

        it('fails when filtering attributes with unallowed operators', () => {
            // /article/?filter=date!=Test
            const req = {
                resource: 'article',
                filter: [[{ attribute: ['date'], operator: 'notEqual', value: 'Test' }]]
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(
                RequestError,
                'Can not filter by attribute "date" with "notEqual" (allowed operators: greaterOrEqual, lessOrEqual)'
            );
        });

        it('resolves request with search', () => {
            // /article/?search=test
            const req = {
                resource: 'article',
                search: 'test'
            };

            const dataSourceTree = {
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
                    articleId: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails on search when resource does not support it', () => {
            // /user/?search=test
            const req = {
                resource: 'user',
                search: 'test'
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Resource does not support fulltext-search');
        });

        it('resolves request with order', () => {
            // /article/?order=date:desc
            const req = {
                resource: 'article',
                order: [{ attribute: ['date'], direction: 'asc' }]
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    order: [{ attribute: 'timestamp', direction: 'asc' }],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails when ordering by non-sortable attributes', () => {
            // /article/?order=title:desc
            const req = {
                resource: 'article',
                order: [{ attribute: ['title'], direction: 'asc' }]
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Attribute "title" can not be ordered');
        });

        it('fails when ordering attributes in unallowed directions', () => {
            // /article/?order=date:topflop
            const req = {
                resource: 'article',
                order: [{ attribute: ['date'], direction: 'topflop' }]
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Attribute "date" can not be ordered "topflop" (allowed: asc, desc)');
        });

        it('resolves request with limit', () => {
            // /article/?limit=100
            const req = {
                resource: 'article',
                limit: 100
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves request with limit/page', () => {
            // /article/?limit=50&page=2
            const req = {
                resource: 'article',
                limit: 50,
                page: 2
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('fails on request with page without limit', () => {
            // /article/?page=2
            const req = {
                resource: 'article',
                page: 2
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Always specify a fixed limit when requesting page');
        });
    });

    describe('limit, defaultLimit and maxLimit', () => {
        it('uses defaultLimit if no limit is given', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.defaultLimit = 42;

            const req = {
                resource: 'article'
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2).dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 42);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('uses limit to override defaultLimit', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.defaultLimit = 42;

            const req = {
                resource: 'article',
                limit: 44
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2).dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 44);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('uses maxLimit if no limit is given', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.maxLimit = 43;

            const req = {
                resource: 'article'
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2).dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 43);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('uses defaultLimit even if maxLimit is given', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.maxLimit = 43;
            resourceConfigs2['article'].config.defaultLimit = 40;

            const req = {
                resource: 'article'
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2).dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 40);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('uses limit if limit <= maxLimit', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.maxLimit = 45;

            const req = {
                resource: 'article',
                limit: 45
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2).dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 45);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('fails if limit > maxLimit', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.maxLimit = 43;

            const req = {
                resource: 'article',
                limit: 44
            };

            expect(() => {
                requestResolver(req, resourceConfigs2);
            }).to.throw(RequestError, 'Invalid limit 44, maxLimit is 43');
        });

        it('allows limit = 0', () => {
            const req = {
                resource: 'article',
                limit: 0
            };

            const resolvedRequest = requestResolver(req, resourceConfigs).dataSourceTree.request;

            expect(resolvedRequest).to.have.property('limit', 0);
            expect(resolvedRequest).to.not.have.property('limitPer');
        });

        it('fails on limit on single resources', () => {
            const req = {
                resource: 'article',
                id: 1,
                limit: 2
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Invalid limit on a single resource');
        });
    });

    describe('limit, defaultLimit and maxLimit in sub-resources', () => {
        it('resolves "limitPer" inside a "many" relation', () => {
            const req = {
                resource: 'article',
                select: {
                    comments: {
                        limit: 5
                    }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            const resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 5);
            expect(resolvedSubRequest).to.have.property('limitPer', 'articleId');
        });

        it('uses defaultLimit if no limit is given', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.attributes['comments'].defaultLimit = 42;

            const req = {
                resource: 'article',
                id: 1,
                select: {
                    comments: {}
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2);
            const resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 42);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('uses limit to override defaultLimit', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.attributes['comments'].defaultLimit = 42;

            const req = {
                resource: 'article',
                id: 1,
                select: {
                    comments: {
                        limit: 44
                    }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2);
            const resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 44);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('uses maxLimit if no limit is given', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.attributes['comments'].maxLimit = 43;

            const req = {
                resource: 'article',
                id: 1,
                select: {
                    comments: {}
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2);
            const resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 43);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('uses defaultLimit even if maxLimit is given', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.attributes['comments'].maxLimit = 43;
            resourceConfigs2['article'].config.attributes['comments'].defaultLimit = 40;

            const req = {
                resource: 'article',
                id: 1,
                select: {
                    comments: {}
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2);
            const resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 40);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('uses limit if limit <= maxLimit', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.attributes['comments'].maxLimit = 45;

            const req = {
                resource: 'article',
                id: 1,
                select: {
                    comments: {
                        limit: 45
                    }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2);
            const resolvedSubRequest = resolvedRequest.dataSourceTree.subRequests[0].request;

            expect(resolvedSubRequest).to.have.property('limit', 45);
            expect(resolvedSubRequest).to.not.have.property('limitPer');
        });

        it('fails if limit > maxLimit', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config.attributes['comments'].maxLimit = 45;

            const req = {
                resource: 'article',
                id: 1,
                select: {
                    comments: {
                        limit: 46
                    }
                }
            };

            expect(() => {
                requestResolver(req, resourceConfigs2);
            }).to.throw(RequestError, 'Invalid limit 46, maxLimit is 45 (in "comments")');
        });

        it('fails on limit on single sub-resources', () => {
            const req = {
                resource: 'article',
                id: 1,
                select: {
                    author: {
                        limit: 2
                    }
                }
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Invalid limit on a single resource (in "author")');
        });
    });

    describe('defaultOrder', () => {
        it('uses defaultOrder if no order is given', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article'].config['defaultOrder'] = [
                {
                    attribute: ['date'],
                    direction: 'asc'
                }
            ];

            // /article/
            const req = {
                resource: 'article'
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10,
                    order: [{ attribute: 'timestamp', direction: 'asc' }]
                },
                attributeOptions: {
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('uses order to override defaultOrder', () => {
            const resourceConfigs2 = _.cloneDeep(resourceConfigs);
            resourceConfigs2['article']['defaultOrder'] = [
                {
                    attribute: ['date'],
                    direction: 'asc'
                }
            ];

            // /article/
            const req = {
                resource: 'article',
                order: [
                    {
                        attribute: ['date'],
                        direction: 'desc'
                    }
                ]
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    limit: 10,
                    order: [{ attribute: 'timestamp', direction: 'desc' }]
                },
                attributeOptions: {
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs2);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });
    });

    describe('high level error handling', () => {
        it('fails on "id"-option on sub-resource-nodes', () => {
            // /article/?select=comments(id=1)
            const req = {
                resource: 'article',
                select: {
                    comments: {
                        id: 1
                    }
                }
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'ID option only allowed at root (in "comments")');
        });

        it('fails on sub-resource-options on non-resource-nodes', () => {
            // /article/?select=source(limit=20)
            let req = {
                resource: 'article',
                select: {
                    source: {
                        limit: 20
                    }
                }
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.throw(RequestError, 'Sub-Resource options not possible on "source"');

            // only "select" is allowed here (standard case):
            // /article/?select=source.name
            req = {
                resource: 'article',
                select: {
                    source: {
                        select: {
                            name: {}
                        }
                    }
                }
            };

            expect(() => {
                requestResolver(req, resourceConfigs);
            }).to.not.throw(Error);
        });
    });

    describe('request resolving with relations', () => {
        it('resolves selected sub-resource (1:1 relation - invisible primaryKey)', () => {
            // /article/?select=video.url
            const req = {
                resource: 'article',
                select: {
                    video: {
                        select: {
                            url: {}
                        }
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' },
                            url: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (1:n relation)', () => {
            // /article/?select=comments.content
            const req = {
                resource: 'article',
                select: {
                    comments: {
                        select: {
                            content: {}
                        }
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            attributes: ['articleId', 'id', 'content'],
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            articleId: { type: 'int' },
                            content: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (1:n relation) with secondary DataSource', () => {
            // /article/?select=comments[content,likes]
            const req = {
                resource: 'article',
                select: {
                    comments: {
                        select: {
                            content: {},
                            likes: {}
                        }
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            attributes: ['articleId', 'id', 'content'],
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            articleId: { type: 'int' },
                            content: { type: 'string' }
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
                                    filter: [[{ attribute: 'commentId', operator: 'equal', valueFromParentKey: true }]]
                                },
                                attributeOptions: {
                                    commentId: { type: 'int' },
                                    count: { type: 'int' }
                                }
                            }
                        ]
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (n:1 relation)', () => {
            // /article/?select=author[firstname,lastname]
            const req = {
                resource: 'article',
                select: {
                    author: {
                        select: {
                            firstname: {},
                            lastname: {}
                        }
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' },
                    authorId: { type: 'int' }
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
                            filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            firstname: { type: 'string' },
                            lastname: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (m:n - with multi-values and delimiter)', () => {
            // /article/?select=countries.name
            const req = {
                resource: 'article',
                select: {
                    countries: {
                        select: {
                            name: {}
                        }
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' },
                    countries: { multiValued: true, type: 'string', delimiter: ',' }
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
                            attributes: ['iso', 'id', 'name'],
                            filter: [[{ attribute: 'iso', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            iso: { type: 'string' },
                            name: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves selected sub-resource (m:n - with join-table + additional fields)', () => {
            // /article/?select=categories[name,order]
            const req = {
                resource: 'article',
                select: {
                    categories: {
                        select: {
                            name: {},
                            order: {}
                        }
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' },
                            categoryId: { type: 'int' },
                            order: { type: 'int' }
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
                                    filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                                },
                                attributeOptions: {
                                    id: { type: 'int' },
                                    name: { type: 'string' }
                                }
                            }
                        ]
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('combines filter for selected sub-resource', () => {
            // /article/?select=comments(filter=id=3 OR id=4)
            const req = {
                resource: 'article',
                select: {
                    comments: {
                        filter: [
                            [{ attribute: ['id'], operator: 'equal', value: 3 }],
                            [{ attribute: ['id'], operator: 'equal', value: 4 }]
                        ]
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            attributes: ['articleId', 'id'],
                            filter: [
                                [
                                    { attribute: 'id', operator: 'equal', value: 3 },
                                    { attribute: 'articleId', operator: 'equal', valueFromParentKey: true }
                                ],
                                [
                                    { attribute: 'id', operator: 'equal', value: 4 },
                                    { attribute: 'articleId', operator: 'equal', valueFromParentKey: true }
                                ]
                            ]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            articleId: { type: 'int' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });
    });

    describe('handling of dependencies', () => {
        it('selects dependant attributes internally (but not externally)', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['copyright'].depends = { date: {} };

            // /article/?select=copyright
            const req = {
                resource: 'article',
                select: {
                    copyright: {}
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' },
                    timestamp: { type: 'datetime' }
                }
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['date'].selected).not.to.be.true;
        });

        it('allows to depend on hidden attributes', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['copyright'].depends = { secretInfo: {} };

            // /article/?select=copyright
            const req = {
                resource: 'article',
                select: {
                    copyright: {}
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' },
                    secretInfo: { type: 'string' }
                }
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['secretInfo'].selected).not.to.be.true;
        });

        it('selects recursive dependencies', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['title'].depends = { copyright: {} };
            configs['article'].config.attributes['copyright'].depends = { date: {} };

            // /article/?select=title
            const req = {
                resource: 'article',
                select: {
                    title: {}
                }
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'title', 'timestamp'],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' },
                    title: { type: 'string' },
                    timestamp: { type: 'datetime' }
                }
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['date'].selected).not.to.be.true;
        });

        it('selects cyclic dependencies properly', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['title'].depends = { date: {} };
            configs['article'].config.attributes['date'].depends = { copyright: {} };
            configs['article'].config.attributes['copyright'].depends = { title: {} };

            // /article/?select=title
            const req = {
                resource: 'article',
                select: {
                    title: {}
                }
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id', 'title', 'timestamp'],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' },
                    title: { type: 'string' },
                    timestamp: { type: 'datetime' }
                }
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['date'].selected).not.to.be.true;
        });

        it('selects dependant sub-resources internally', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['copyright'].depends = {
                author: { select: { firstname: {}, lastname: {} } }
            };

            // /article/?select=copyright
            const req = {
                resource: 'article',
                select: {
                    copyright: {}
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' },
                    authorId: { type: 'int' }
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
                            filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            firstname: { type: 'string' },
                            lastname: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['author'].selected).not.to.be.true;
        });

        it('selects dependant attributes on sub-resources', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['copyright'].depends = {
                video: { select: { url: {} } }
            };
            configs['article'].config.attributes['video'].depends = {
                youtubeId: {}
            };
            configs['article'].config.attributes['video'].attributes['youtubeId'].depends = {
                url: {}
            };

            // /article/?select=copyright
            const req = {
                resource: 'article',
                select: {
                    copyright: {}
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            attributes: ['articleId', 'url', 'youtubeId'],
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' },
                            url: { type: 'string' },
                            youtubeId: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['video'].attributes['youtubeId'].selected).not.to.be.true;
            expect(resolvedRequest.resolvedConfig.attributes['video'].attributes['url'].selected).not.to.be.true;
        });

        it('uses correct {root} context for inline sub-resource', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['video'].attributes['url'].depends = {
                '{root}': { select: { title: {} } }
            };

            const req = {
                resource: 'article',
                select: {
                    video: {
                        select: { url: {} }
                    }
                }
            };

            const resolvedReq = {
                resource: 'article',
                select: {
                    id: { isPrimary: true },
                    title: { internal: true },
                    video: {
                        select: {
                            articleId: { internal: true, isPrimary: true },
                            url: {}
                        }
                    }
                }
            };

            requestResolver(req, configs);
            expect(resolvedReq).to.eql(req);
        });

        it('uses correct {root} context for included sub-resource', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['user'].config.attributes['firstname'].depends = {
                '{root}': { select: { lastname: {} } }
            };

            const req = {
                resource: 'article',
                select: {
                    author: {
                        select: {
                            firstname: {}
                        }
                    }
                }
            };

            const resolvedReq = {
                resource: 'article',
                select: {
                    id: { isPrimary: true },
                    author: {
                        select: {
                            id: { isPrimary: true },
                            firstname: {},
                            lastname: { internal: true }
                        }
                    }
                }
            };

            requestResolver(req, configs);
            expect(resolvedReq).to.eql(req);
        });

        it('handles "depends" at root level', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['user'].config.depends = {
                '{root}': { select: { lastname: {} } }
            };

            const req = {
                resource: 'user'
            };

            const resolvedReq = {
                resource: 'user',
                select: {
                    id: { isPrimary: true },
                    lastname: { internal: true }
                }
            };

            requestResolver(req, configs);
            expect(resolvedReq).to.eql(req);
        });

        it('uses correct relative context for included sub-resource', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['author'].depends = { lastname: {} };

            const req = {
                resource: 'article',
                select: {
                    author: {}
                }
            };

            const resolvedReq = {
                resource: 'article',
                select: {
                    id: { isPrimary: true },
                    author: {
                        select: {
                            id: { isPrimary: true },
                            lastname: { internal: true }
                        }
                    }
                }
            };

            requestResolver(req, configs);
            expect(resolvedReq).to.eql(req);
        });

        it('uses correct {root} context for included sub-resource', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['author'].depends = { '{root}': { select: { title: {} } } };

            const req = {
                resource: 'article',
                select: {
                    author: {}
                }
            };

            const resolvedReq = {
                resource: 'article',
                select: {
                    id: { isPrimary: true },
                    title: { internal: true },
                    author: {
                        select: {
                            id: { isPrimary: true }
                        }
                    }
                }
            };

            requestResolver(req, configs);
            expect(resolvedReq).to.eql(req);
        });

        it('handles "depends" + "select" on same sub-resource', () => {
            const configs = _.cloneDeep(resourceConfigs);
            configs['article'].config.attributes['copyright'].depends = {
                author: { select: { firstname: {}, lastname: {} } }
            };

            // /article/?select=copyright,author.firstname
            const req = {
                resource: 'article',
                select: {
                    copyright: {},
                    author: { select: { firstname: {} } }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' },
                    authorId: { type: 'int' }
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
                            filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            firstname: { type: 'string' },
                            lastname: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['author'].selected).to.be.true;
            expect(resolvedRequest.resolvedConfig.attributes['author'].attributes['firstname'].selected).to.be.true;
            expect(resolvedRequest.resolvedConfig.attributes['author'].attributes['lastname'].selected).not.to.be.true;
        });
    });

    describe('handling of multiple DataSources per resource', () => {
        it('resolves selected field from Sub-DataSource', () => {
            // /article/?select=body
            const req = {
                resource: 'article',
                select: {
                    body: {}
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' },
                            body: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves parentKey in secondary DataSources', () => {
            // /article/?select=author&search=test
            const req = {
                resource: 'article',
                select: {
                    author: {
                        select: {
                            firstname: {},
                            lastname: {}
                        }
                    }
                },
                search: 'test'
            };

            const dataSourceTree = {
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
                    articleId: { type: 'int' }
                },
                subRequests: [
                    {
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
                            filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            authorId: { type: 'int' }
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
                                    filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                                },
                                attributeOptions: {
                                    id: { type: 'int' },
                                    firstname: { type: 'string' },
                                    lastname: { type: 'string' }
                                }
                            }
                        ]
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['author'].parentDataSource).to.equal('primary');
        });
    });

    describe('handling of composite primary keys', () => {
        it('resolves composite primaryKey linked by non-composite key', () => {
            // /article/?select=versions.title
            const req = {
                resource: 'article',
                select: {
                    versions: {
                        select: {
                            title: {}
                        }
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' },
                            versionId: { type: 'int' },
                            title: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves composite parentKey/childKey', () => {
            // /article/?select=versions.versioninfo.modified
            const req = {
                resource: 'article',
                select: {
                    versions: {
                        select: {
                            versioninfo: {
                                select: {
                                    modified: {}
                                }
                            }
                        }
                    }
                }
            };

            const dataSourceTree = {
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
                    id: { type: 'int' }
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
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' },
                            versionId: { type: 'int' }
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
                                            {
                                                attribute: ['articleId', 'versionId'],
                                                operator: 'equal',
                                                valueFromParentKey: true
                                            }
                                        ]
                                    ]
                                },
                                attributeOptions: {
                                    articleId: { type: 'int' },
                                    versionId: { type: 'int' },
                                    modified: { type: 'datetime' }
                                }
                            }
                        ]
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });
    });

    describe('filter by sub-resources', () => {
        it('resolves filter by sub-resource primary key without "rewriteTo"', () => {
            const configs = _.cloneDeep(resourceConfigs);
            delete configs['article'].config.subFilters[0].rewriteTo;

            // /article/?filter=author.id=11,12,13
            const req = {
                resource: 'article',
                filter: [[{ attribute: ['author', 'id'], operator: 'equal', value: [11, 12, 13] }]]
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [[{ attribute: 'authorId', operator: 'equal', valueFromSubFilter: 0 }]],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' }
                },
                subFilters: [
                    {
                        parentKey: ['authorId'],
                        childKey: ['id'],
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'user',
                            attributes: ['id'],
                            filter: [[{ attribute: 'id', operator: 'equal', value: [11, 12, 13] }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, configs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves filter by sub-resource primary key with "rewriteTo"', () => {
            // /article/?filter=author.id=11,12,13
            const req = {
                resource: 'article',
                filter: [[{ attribute: ['author', 'id'], operator: 'equal', value: [11, 12, 13] }]]
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [[{ attribute: 'authorId', operator: 'equal', value: [11, 12, 13] }]],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' }
                }
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves filter by sub-resource-attribute', () => {
            // /article/?filter=video.youtubeId="xyz123"
            const req = {
                resource: 'article',
                filter: [[{ attribute: ['video', 'youtubeId'], operator: 'equal', value: 'xyz123' }]]
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [[{ attribute: 'id', operator: 'equal', valueFromSubFilter: 0 }]],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' }
                },
                subFilters: [
                    {
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_video',
                            attributes: ['articleId'],
                            filter: [[{ attribute: 'youtubeId', operator: 'equal', value: 'xyz123' }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves filter by sub-sub-resource', () => {
            // /article/?filter=comments.user.id=123
            const req = {
                resource: 'article',
                filter: [[{ attribute: ['comments', 'user', 'id'], operator: 'equal', value: 123 }]]
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [[{ attribute: 'id', operator: 'equal', valueFromSubFilter: 0 }]],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' }
                },
                subFilters: [
                    {
                        parentKey: ['id'],
                        childKey: ['articleId'],
                        request: {
                            type: 'mysql',
                            database: 'contents',
                            table: 'article_comment',
                            attributes: ['articleId'],
                            filter: [[{ attribute: 'userId', operator: 'equal', valueFromSubFilter: 0 }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' }
                        },
                        subFilters: [
                            {
                                parentKey: ['userId'],
                                childKey: ['id'],
                                request: {
                                    type: 'mysql',
                                    database: 'contents',
                                    table: 'user',
                                    attributes: ['id'],
                                    filter: [[{ attribute: 'id', operator: 'equal', value: 123 }]]
                                },
                                attributeOptions: {
                                    id: { type: 'int' }
                                }
                            }
                        ]
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves filter by sub-resource with joinVia', () => {
            // /article/?filter=categories.id=1234
            const req = {
                resource: 'article',
                filter: [[{ attribute: ['categories', 'id'], operator: 'equal', value: 1234 }]]
            };

            const dataSourceTree = {
                resourceName: 'article',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'mysql',
                    database: 'contents',
                    table: 'article',
                    attributes: ['id'],
                    filter: [[{ attribute: 'id', operator: 'equal', valueFromSubFilter: 0 }]],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' }
                },
                subFilters: [
                    {
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
                            filter: [[{ attribute: 'categoryId', operator: 'equal', valueFromSubFilter: 0 }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' }
                        },
                        subFilters: [
                            {
                                parentKey: ['categoryId'],
                                childKey: ['id'],
                                request: {
                                    type: 'mysql',
                                    database: 'contents',
                                    table: 'category',
                                    attributes: ['id'],
                                    filter: [[{ attribute: 'id', operator: 'equal', value: 1234 }]]
                                },
                                attributeOptions: {
                                    id: { type: 'int' }
                                }
                            }
                        ]
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });
    });

    describe('complex request resolving', () => {
        it('resolves two overlapping composite parentKeys in different secondary DataSources', () => {
            const testResourceConfigs = {
                resource1: {
                    config: {
                        primaryKey: [['id']],
                        resolvedPrimaryKey: { primary: ['id'], secondary1: ['id'], secondary2: ['id'] },
                        dataSources: {
                            primary: { type: 'test' },
                            secondary1: { type: 'test' },
                            secondary2: { type: 'test' }
                        },
                        attributes: {
                            id: {
                                type: 'int',
                                map: { default: { primary: 'id', secondary1: 'id', secondary2: 'id' } }
                            },
                            firstKeyPart: {
                                type: 'int',
                                map: { default: { secondary1: 'firstKeyPart', secondary2: 'firstKeyPart' } }
                            },
                            keyPart1: {
                                type: 'int',
                                map: { default: { secondary1: 'keyPart1' } }
                            },
                            keyPart2: {
                                type: 'int',
                                map: { default: { secondary2: 'keyPart2' } }
                            },
                            subResource1: {
                                primaryKey: [['firstKeyPart'], ['keyPart1']],
                                resolvedPrimaryKey: { primary: ['firstKeyPart', 'keyPart1'] },
                                parentKey: [['firstKeyPart'], ['keyPart1']],
                                resolvedParentKey: { secondary1: ['firstKeyPart', 'keyPart1'] },
                                childKey: [['firstKeyPart'], ['keyPart1']],
                                resolvedChildKey: { primary: ['firstKeyPart', 'keyPart1'] },
                                dataSources: {
                                    primary: { type: 'test' }
                                },
                                attributes: {
                                    firstKeyPart: {
                                        type: 'int',
                                        map: { default: { primary: 'firstKeyPart' } }
                                    },
                                    keyPart1: {
                                        type: 'int',
                                        map: { default: { primary: 'keyPart1' } }
                                    },
                                    name: {
                                        type: 'string',
                                        map: { default: { primary: 'name' } }
                                    }
                                }
                            },
                            subResource2: {
                                primaryKey: [['firstKeyPart'], ['keyPart2']],
                                resolvedPrimaryKey: { primary: ['firstKeyPart', 'keyPart2'] },
                                parentKey: [['firstKeyPart'], ['keyPart2']],
                                resolvedParentKey: { secondary2: ['firstKeyPart', 'keyPart2'] },
                                childKey: [['firstKeyPart'], ['keyPart2']],
                                resolvedChildKey: { primary: ['firstKeyPart', 'keyPart2'] },
                                dataSources: {
                                    primary: { type: 'test' }
                                },
                                attributes: {
                                    firstKeyPart: {
                                        type: 'int',
                                        map: { default: { primary: 'firstKeyPart' } }
                                    },
                                    keyPart2: {
                                        type: 'int',
                                        map: { default: { primary: 'keyPart2' } }
                                    },
                                    name: {
                                        type: 'string',
                                        map: { default: { primary: 'name' } }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            // /resource1/?select=subResource1.name,subResource2.name
            const req = {
                resource: 'resource1',
                select: {
                    subResource1: {
                        select: {
                            name: {}
                        }
                    },
                    subResource2: {
                        select: {
                            name: {}
                        }
                    }
                }
            };

            const dataSourceTree = {
                resourceName: 'resource1',
                attributePath: [],
                dataSourceName: 'primary',
                request: {
                    type: 'test',
                    attributes: ['id'],
                    limit: 10
                },
                attributeOptions: {
                    id: { type: 'int' }
                },
                subRequests: [
                    {
                        attributePath: [],
                        dataSourceName: 'secondary1',
                        parentKey: ['id'],
                        childKey: ['id'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'test',
                            attributes: ['id', 'firstKeyPart', 'keyPart1'],
                            filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            firstKeyPart: { type: 'int' },
                            keyPart1: { type: 'int' }
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
                                            {
                                                attribute: ['firstKeyPart', 'keyPart1'],
                                                operator: 'equal',
                                                valueFromParentKey: true
                                            }
                                        ]
                                    ]
                                },
                                attributeOptions: {
                                    firstKeyPart: { type: 'int' },
                                    keyPart1: { type: 'int' },
                                    name: { type: 'string' }
                                }
                            }
                        ]
                    },
                    {
                        attributePath: [],
                        dataSourceName: 'secondary2',
                        parentKey: ['id'],
                        childKey: ['id'],
                        multiValuedParentKey: false,
                        uniqueChildKey: true,
                        request: {
                            type: 'test',
                            attributes: ['id', 'firstKeyPart', 'keyPart2'],
                            filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            firstKeyPart: { type: 'int' },
                            keyPart2: { type: 'int' }
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
                                            {
                                                attribute: ['firstKeyPart', 'keyPart2'],
                                                operator: 'equal',
                                                valueFromParentKey: true
                                            }
                                        ]
                                    ]
                                },
                                attributeOptions: {
                                    firstKeyPart: { type: 'int' },
                                    keyPart2: { type: 'int' },
                                    name: { type: 'string' }
                                }
                            }
                        ]
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, testResourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
            expect(resolvedRequest.resolvedConfig.attributes['subResource1'].parentDataSource).to.equal('secondary1');
            expect(resolvedRequest.resolvedConfig.attributes['subResource2'].parentDataSource).to.equal('secondary2');
        });

        it('resolves full-featured request', () => {
            // /article/?
            // select=date,title,subTitle,source[name,externalId],body,author[firstname,lastname]&
            // filter=date<=2014-12-01T00:00:00%2B01:00 AND categories.id=12,13&
            // order=date:desc&
            // limit=10&
            // page=1
            const req = {
                resource: 'article',
                select: {
                    date: {},
                    title: {},
                    subTitle: {},
                    source: {
                        select: {
                            name: {},
                            externalId: {}
                        }
                    },
                    body: {},
                    author: {
                        select: {
                            firstname: {},
                            lastname: {}
                        }
                    }
                },
                filter: [
                    [
                        { attribute: ['date'], operator: 'lessOrEqual', value: '2014-12-01T00:00:00+01:00' },
                        { attribute: ['categories', 'id'], operator: 'equal', value: [12, 13] }
                    ]
                ],
                order: [
                    {
                        attribute: ['date'],
                        direction: 'desc'
                    }
                ],
                limit: 10,
                page: 1
            };

            const dataSourceTree = {
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
                            { attribute: 'timestamp', operator: 'lessOrEqual', value: '2014-12-01T00:00:00+01:00' },
                            { attribute: 'id', operator: 'equal', valueFromSubFilter: 0 }
                        ]
                    ],
                    order: [
                        {
                            attribute: 'timestamp',
                            direction: 'desc'
                        }
                    ],
                    limit: 10,
                    page: 1
                },
                attributeOptions: {
                    id: { type: 'int' },
                    timestamp: { type: 'datetime' },
                    title: { type: 'string' },
                    sourceName: { type: 'string' },
                    externalId: { type: 'string' },
                    authorId: { type: 'int' }
                },
                subFilters: [
                    {
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
                            filter: [[{ attribute: 'categoryId', operator: 'equal', valueFromSubFilter: 0 }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' }
                        },
                        subFilters: [
                            {
                                parentKey: ['categoryId'],
                                childKey: ['id'],
                                request: {
                                    type: 'mysql',
                                    database: 'contents',
                                    table: 'category',
                                    attributes: ['id'],
                                    filter: [[{ attribute: 'id', operator: 'equal', value: [12, 13] }]]
                                },
                                attributeOptions: {
                                    id: { type: 'int' }
                                }
                            }
                        ]
                    }
                ],
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
                            filter: [[{ attribute: 'articleId', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            articleId: { type: 'int' },
                            body: { type: 'string' }
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
                            filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                        },
                        attributeOptions: {
                            id: { type: 'int' },
                            firstname: { type: 'string' },
                            lastname: { type: 'string' }
                        }
                    }
                ]
            };

            const resolvedRequest = requestResolver(req, resourceConfigs);
            expect(resolvedRequest.dataSourceTree).to.eql(dataSourceTree);
        });

        it('resolves resolved-config.json fixture correctly', () => {
            // /article/?select=date,title,subTitle,author[firstname,lastname],
            //     categories[name,order],countries.name,body,video.url,
            //     source[name,externalId],comments[content,user[firstname,lastname]],
            //     versions[title,versioninfo.modified]
            const req = {
                resource: 'article',
                select: {
                    date: {},
                    title: {},
                    subTitle: {},
                    author: {
                        select: {
                            firstname: {},
                            lastname: {}
                        }
                    },
                    categories: {
                        select: {
                            name: {},
                            order: {}
                        }
                    },
                    countries: {
                        select: {
                            name: {}
                        }
                    },
                    body: {},
                    video: {
                        select: {
                            url: {}
                        }
                    },
                    source: {
                        select: {
                            name: {},
                            externalId: {}
                        }
                    },
                    comments: {
                        select: {
                            content: {},
                            user: {
                                select: {
                                    firstname: {},
                                    lastname: {}
                                }
                            }
                        }
                    },
                    versions: {
                        select: {
                            title: {},
                            versioninfo: {
                                select: {
                                    modified: {}
                                }
                            }
                        }
                    }
                }
            };

            const resolvedConfig = require('./fixtures/resolved-config.json');

            const resolvedRequest = requestResolver(req, resourceConfigs);

            function cleanupAttributes(parentAttrNode) {
                if (parentAttrNode._attrsRefs) {
                    delete parentAttrNode._attrsRefs;
                }

                for (let attrName in parentAttrNode.attributes) {
                    let attrNode = parentAttrNode.attributes[attrName];

                    if (attrNode.attributes) {
                        cleanupAttributes(attrNode);
                    }

                    if (attrNode.selected) {
                        attrNode.selected = false;
                    }
                }
            }

            cleanupAttributes(resolvedRequest.resolvedConfig);

            // for manually generating fixture:
            //console.log(JSON.stringify(resolvedRequest.resolvedConfig, null, 4));

            expect(resolvedRequest.resolvedConfig).to.eql(resolvedConfig);
        });
    });
});

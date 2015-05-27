'use strict';

var bunyan = require('bunyan');
var resultBuilder = require('../lib/result-builder');
var ImplementationError = require('flora-errors').ImplementationError;
var DataError = require('flora-errors').DataError;
var NotFoundError = require('flora-errors').NotFoundError;

var _ = require('lodash');
var expect = require('chai').expect;

// mock Api instance
var api = {
    log: bunyan.createLogger({name: 'null', streams: []}),
    getResource: function () {
        return null;
    }
};

describe('result-builder', function () {
    var defaultResolvedConfig = require('./fixtures/resolved-config.json');

    describe('simple results', function () {
        it('builds empty result (many = true)', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [],
                totalCount: 0
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['id'].selected = true;

            var expectedResult = {
                cursor: {
                    totalCount: 0
                },
                data: []
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });

        it('throws NotFoundError on empty result (many = false)', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [],
                totalCount: 0
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(NotFoundError, 'Requested item not found');
        });

        it('builds simple result (many = true)', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    title: 'Test-Article'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['title'].selected = true;

            var expectedResult = {
                cursor: {
                    totalCount: 1
                },
                data: [{
                    id: 1,
                    title: 'Test-Article'
                }]
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });

        it('builds simple result (many = false)', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    title: 'Test-Article'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['title'].selected = true;

            var expectedResult = {
                data: {
                    id: 1,
                    title: 'Test-Article'
                }
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });
    });

    describe('type casting', function () {
        var castingRawResults = [{
            attributePath: [],
            dataSourceName: 'primary',
            data: [{
                id: 1,
                attribute: null
            }],
            totalCount: 1
        }];

        var castingResolvedConfig = _.cloneDeep(defaultResolvedConfig);
        castingResolvedConfig.many = false;
        castingResolvedConfig.attributes['id'].selected = true;
        castingResolvedConfig.attributes['typetest'] = {
            selected: true,
            map: {
                'default': {
                    'primary': 'typetest'
                }
            },
            selectedDataSource: 'primary'
        };

        it('casts type "string"', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = 100;
            resolvedConfig.attributes['typetest'].type = 'string';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal('100');
        });

        it('casts type "int"', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = '100';
            resolvedConfig.attributes['typetest'].type = 'int';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal(100);
        });

        it('casts type "float"', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = '100.1';
            resolvedConfig.attributes['typetest'].type = 'float';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal(100.1);
        });

        it('casts type "boolean"', function () {
            // '1':
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = '1';
            resolvedConfig.attributes['typetest'].type = 'boolean';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal(true);

            // '0':
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = '0';
            resolvedConfig.attributes['typetest'].type = 'boolean';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal(false);
        });

        it('casts type "date"', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = '2015-03-03 15:00:00';
            resolvedConfig.attributes['typetest'].type = 'date';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal('2015-03-03T14:00:00.000Z');
        });

        it('casts type "datetime"', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = '2015-03-03 15:00:00';
            resolvedConfig.attributes['typetest'].type = 'datetime';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal('2015-03-03T14:00:00.000Z');
        });

        it('casts type "time"', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = '2015-03-03 15:00:00';
            resolvedConfig.attributes['typetest'].type = 'time';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal('2015-03-03T14:00:00.000Z');
        });

        it('passes through objects type "raw" (preserves objects)', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = {foo: 'bar'};
            resolvedConfig.attributes['typetest'].type = 'raw';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.eql({foo: 'bar'});
        });

        it('passes through objects type "raw" (preserves strings)', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = 'foo';
            resolvedConfig.attributes['typetest'].type = 'raw';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.eql('foo');
        });

        it('passes through objects type "raw" (preserves integers)', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = 42;
            resolvedConfig.attributes['typetest'].type = 'raw';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.eql(42);
        });

        it('always passes through "null"', function () {
            var rawResults = _.cloneDeep(castingRawResults);
            var resolvedConfig = _.cloneDeep(castingResolvedConfig);

            rawResults[0].data[0]['typetest'] = null;
            resolvedConfig.attributes['typetest'].type = 'int';

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result.data['typetest']).to.equal(null);
        });
    });

    describe('attribute features', function () {
        it('builds result with nested attributes', function () {
            // /article/?select=source.name
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    sourceName: 'CNN'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['source'].selected = true;
            resolvedConfig.attributes['source'].attributes['name'].selected = true;

            var expectedResult = {
                data: {
                    id: 1,
                    source: {
                        name: 'CNN'
                    }
                }
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });

        it('maps attribute names', function () {
            // /article/?select=title ("mappedTitle" in DataSource)
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    mappedTitle: 'Title'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['title'].selected = true;
            resolvedConfig.attributes['title'].map['default']['primary'] = 'mappedTitle';

            var expectedResult = {
                data: {
                    id: 1,
                    title: 'Title'
                }
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });

        it('sets static values', function () {
            // /article/?select=subTitle
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['subTitle'].selected = true;
            resolvedConfig.attributes['subTitle'].value = 'Deprecated Sub-Title';

            var expectedResult = {
                data: {
                    id: 1,
                    subTitle: 'Deprecated Sub-Title'
                }
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });
    });

    describe('results with relations', function () {
        it('builds result with 1:1 relation - invisible primaryKey', function () {
            // /article/?select=video.url
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                }],
                totalCount: 1
            },{
                attributePath: ['video'],
                dataSourceName: 'primary',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    articleId: '1',
                    url: 'http://example.com/video/123'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['video'].selected = true;
            resolvedConfig.attributes['video'].attributes['url'].selected = true;

            var expectedResult = {
                data: {
                    id: 1,
                    video: {
                        url: 'http://example.com/video/123'
                    }
                }
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });

        it('builds result with 1:n relation', function () {
            // /article/?select=comments.content
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                },{
                    id: '2'
                }],
                totalCount: 2
            },{
                attributePath: ['comments'],
                dataSourceName: 'primary',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    id: '100',
                    articleId: '1',
                    content: 'Comment 1'
                },
                {
                    id: '101',
                    articleId: '1',
                    content: 'Comment 2'
                }],
                totalCount: 2
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['comments'].selected = true;
            resolvedConfig.attributes['comments'].attributes['id'].selected = true;
            resolvedConfig.attributes['comments'].attributes['content'].selected = true;

            var expectedResult = {
                cursor: {
                    totalCount: 2
                },
                data: [{
                    id: 1,
                    comments: [{
                        id: 100,
                        content: 'Comment 1'
                    },{
                        id: 101,
                        content: 'Comment 2'
                    }]
                },{
                    id: 2,
                    comments: []
                }]
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });

        it('builds result with n:1 relation', function () {
            // /article/?select=author[firstname,lastname]
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    authorId: '10'
                }],
                totalCount: 1
            },{
                attributePath: ['author'],
                dataSourceName: 'primary',
                parentKey: ['authorId'],
                childKey: ['id'],
                data: [{
                    id: '10',
                    firstname: 'Bob',
                    lastname: 'Tester'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['author'].selected = true;
            resolvedConfig.attributes['author'].attributes['id'].selected = true;
            resolvedConfig.attributes['author'].attributes['firstname'].selected = true;
            resolvedConfig.attributes['author'].attributes['lastname'].selected = true;

            var expectedResult = {
                data: {
                    id: 1,
                    author: {
                        id: 10,
                        firstname: 'Bob',
                        lastname: 'Tester'
                    }
                }
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });

        it('builds result with n:1 relation ("null" keys mapped to "null"-objects)', function () {
            // /article/?select=author
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    authorId: null
                }],
                totalCount: 1
            },{
                attributePath: ['author'],
                dataSourceName: 'primary',
                parentKey: ['authorId'],
                childKey: ['id'],
                data: [],
                totalCount: 0
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['author'].selected = true;
            resolvedConfig.attributes['author'].attributes['id'].selected = true;

            var expectedResult = {
                data: {
                    id: 1,
                    author: null
                }
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });

        xit('builds result with n:1 relation (with composite primary keys)', function () {
        });

        xit('builds result with m:n relation - with multi-values and delimiter', function () {
            // /article/?select=countries.name
        });

        xit('builds result with m:n relation - with join-table', function () {
            // /article/?select=categories.name
        });
    });

    describe('results with multiple DataSources per resource', function () {
        it('builds result with selected field from secondary DataSource', function () {
            // /article/?select=body
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                },{
                    id: '2'
                }],
                totalCount: 1
            },{
                attributePath: [],
                dataSourceName: 'articleBody',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    articleId: '1',
                    body: 'Test-Body 1'
                },{
                    articleId: '2',
                    body: 'Test-Body 2'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['body'].selected = true;
            resolvedConfig.attributes['body'].selectedDataSource = 'articleBody';

            var expectedResult = {
                cursor: {
                    totalCount: 1
                },
                data: [{
                    id: 1,
                    body: 'Test-Body 1'
                },{
                    id: 2,
                    body: 'Test-Body 2'
                }]
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });
    });

    describe('error handling on data level', function () {
        it('fails if a primary key attribute is missing', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    otherId: '1' // "id" (primary key) is missing here
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(DataError, 'Result-row of "{root}" (DataSource "primary") ' +
                'misses primary key attribute "id"');
        });

        it('fails if a child key attribute is missing', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                }],
                totalCount: 1
            },{
                attributePath: [],
                dataSourceName: 'articleBody',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    articleId: '1',
                    body: 'Test-Body'
                },{
                    otherId: '2', // misses "articleId" child key attribute
                    body: 'Test-Body'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(DataError, 'Result-row 1 of "{root}" (DataSource "articleBody") ' +
                'misses child key attribute "articleId"');
        });

        it('fails if a parent key attribute is missing', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    otherId: '10' // misses "authorId" parent key attribute
                }],
                totalCount: 1
            },{
                attributePath: ['author'],
                dataSourceName: 'primary',
                parentKey: ['authorId'],
                childKey: ['id'],
                data: [{
                    id: '10',
                    firstname: 'Bob',
                    lastname: 'Tester'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['author'].selected = true;

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(DataError, 'Sub-resource "author" ' +
                'misses key attribute "authorId" in parent result (DataSource "primary")');
        });

        it('fails if row in secondary DataSource (by primary key) is missing', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                }],
                totalCount: 1
            },{
                attributePath: [],
                dataSourceName: 'articleBody',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    articleId: '10', // does not match ID from primary DataSource
                    body: 'Test-Body'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(DataError, 'Secondary DataSource "articleBody" of "{root}": ' +
                'row with key "1" not found');
        });

        it('fails if row in child resource is missing', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                }],
                totalCount: 1
            },{
                attributePath: ['video'],
                dataSourceName: 'primary',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    articleId: '10', // does not match ID from parent resource
                    url: 'http://example.com/video/123'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['video'].selected = true;

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(DataError, 'Foreign key id = "1" not found ' +
                'in sub-resource "video" (DataSource "primary")');
        });

        it('fails if normal attribute is missing', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    otherTitle: 'Title' // misses "title" attribute
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['title'].selected = true;

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(DataError, 'Result-row ID "1" (DataSource "primary") misses attribute "title"');
        });
    });

    describe('implementation error handling ("should never happen"-errors)', function () {
        it('fails on invalid attributePath in result', function () {
            var rawResults = [{
                attributePath: ['any', 'subresource'], // invalid path
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(ImplementationError, 'Result-Builder: Unknown attribute "any.subresource"');
        });

        it('fails if complete result of primary DataSource is missing', function () {
            var rawResults = []; // complete result is missing here

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(ImplementationError, 'Result for "{root}" (DataSource "primary") missing');
        });

        it('fails if complete result of secondary DataSource is missing', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                }],
                totalCount: 1
            }]; // "articleBody" result is missing here

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['body'].selected = true;

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(ImplementationError, 'Secondary-Result for "{root}" (DataSource "articleBody") missing');
        });

        it('fails if complete result of primary DataSource of sub-resource is missing', function () {
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1'
                }],
                totalCount: 1
            }]; // "author"/"primary" result is missing here

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.attributes['author'].selected = true;

            expect(function () {
                resultBuilder(api, {}, rawResults, resolvedConfig);
            }).to.throw(ImplementationError, 'Result for "author" (DataSource "primary") missing');
        });
    });

    describe('complex results', function () {
        it('builds full featured result', function () {
            // /article/?select=date,title,subTitle,author[firstname],body,video.url,source.name,comments[content,user[lastname]]
            var rawResults = [{
                attributePath: [],
                dataSourceName: 'primary',
                data: [{
                    id: '1',
                    timestamp: '2015-03-03 15:00:00',
                    title: 'Title',
                    authorId: '10',
                    sourceName: 'CNN',
                }],
                totalCount: 1
            },{
                attributePath: [],
                dataSourceName: 'articleBody',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    articleId: '1',
                    body: 'Test-Body'
                }],
                totalCount: 1
            },{
                attributePath: ['author'],
                dataSourceName: 'primary',
                parentKey: ['authorId'],
                childKey: ['id'],
                data: [{
                    id: '10',
                    firstname: 'Bob'
                }],
                totalCount: 1
            },{
                attributePath: ['video'],
                dataSourceName: 'primary',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    articleId: '1',
                    url: 'http://example.com/video/123'
                }],
                totalCount: 1
            },{
                attributePath: ['comments'],
                dataSourceName: 'primary',
                parentKey: ['id'],
                childKey: ['articleId'],
                data: [{
                    id: '100',
                    articleId: '1',
                    userId: '20',
                    content: 'Comment 1'
                },{
                    id: '101',
                    articleId: '1',
                    userId: '20',
                    content: 'Comment 2'
                }],
                totalCount: 1
            },{
                attributePath: ['comments', 'user'],
                dataSourceName: 'primary',
                parentKey: ['userId'],
                childKey: ['id'],
                data: [{
                    id: '20',
                    lastname: 'Commenter'
                }],
                totalCount: 1
            }];

            var resolvedConfig = _.cloneDeep(defaultResolvedConfig);
            resolvedConfig.many = false;
            resolvedConfig.attributes['id'].selected = true;
            resolvedConfig.attributes['date'].selected = true;
            resolvedConfig.attributes['title'].selected = true;
            resolvedConfig.attributes['subTitle'].selected = true;
            resolvedConfig.attributes['author'].selected = true;
            resolvedConfig.attributes['author'].attributes['id'].selected = true;
            resolvedConfig.attributes['author'].attributes['firstname'].selected = true;
            resolvedConfig.attributes['body'].selected = true;
            resolvedConfig.attributes['body'].selectedDataSource = 'articleBody';
            resolvedConfig.attributes['video'].selected = true;
            resolvedConfig.attributes['video'].attributes['url'].selected = true;
            resolvedConfig.attributes['source'].selected = true;
            resolvedConfig.attributes['source'].attributes['name'].selected = true;
            resolvedConfig.attributes['comments'].selected = true;
            resolvedConfig.attributes['comments'].attributes['id'].selected = true;
            resolvedConfig.attributes['comments'].attributes['content'].selected = true;
            resolvedConfig.attributes['comments'].attributes['user'].selected = true;
            resolvedConfig.attributes['comments'].attributes['user'].attributes['id'].selected = true;
            resolvedConfig.attributes['comments'].attributes['user'].attributes['lastname'].selected = true;

            var expectedResult = {
                data: {
                    'id': 1,
                    'date': '2015-03-03T14:00:00.000Z',
                    'title': 'Title',
                    'subTitle': null,
                    'author': {
                        'id': 10,
                        'firstname': 'Bob'
                    },
                    'body': 'Test-Body',
                    'video': {
                        'url': 'http://example.com/video/123'
                    },
                    'source': {
                        'name': 'CNN'
                    },
                    'comments': [
                        {
                            'id': 100,
                            'user': {
                                'id': 20,
                                'lastname': 'Commenter'
                            },
                            'content': 'Comment 1'
                        },
                        {
                            'id': 101,
                            'user': {
                                'id': 20,
                                'lastname': 'Commenter'
                            },
                            'content': 'Comment 2'
                        }
                    ]
                }
            };

            var result = resultBuilder(api, {}, rawResults, resolvedConfig);
            expect(result).to.eql(expectedResult);
        });
    });
});

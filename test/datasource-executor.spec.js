'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');

var execute = require('../lib/datasource-executor');

var testDataSource = function testDataSource() {
    return {
        process: function (request, callback) {
            callback(null, {
                data: [],
                totalCount: null
            });
        },
        prepare: function () {}
    };
};

var api = {
    dataSources: {
        test: testDataSource()
    },

    getResource: function () {
        return null;
    }
};

describe('datasource-executor', function () {
    describe('generic tests', function () {
        it('should be a function', function () {
            expect(execute).to.be.a('function');
        });
    });

    describe('error handling', function () {
        it('returns error on invalid request type', function (done) {
            execute(api, {}, {request: {type: 'test-invalid'}}, function (err) {
                expect(err).to.be.an.instanceof(Error);
                done();
            });
        });

        it('passes through errors from process call', function (done) {
            sinon.stub(api.dataSources['test'], 'process', function (query, callback) {
                callback(new Error('foo'));
            });

            var dst = {request: {type: 'test'}};

            execute(api, {}, dst, function (err) {
                api.dataSources['test'].process.restore();
                expect(err).to.be.an.instanceof(Error);
                expect(err.message).to.equal('foo');
                done();
            });
        });

        it('detects missing subFilters', function (done) {
            var dst = {
                request: {
                    type: 'test',
                    filter: [[{attribute: 'bar', operator: 'equal', valueFromSubFilter: true}]]
                }
            };

            execute(api, {}, dst, function (err) {
                expect(err).to.be.an.instanceof(Error);
                expect(err.message).to.equal('Missing subFilter for attribute "bar"');
                done();
            });
        });
    });

    describe('simple requests', function () {
        var dst = {
            attributePath: [],
            dataSourceName: 'ds',
            request: {
                type: 'test'
            }
        };

        it('does not throw errors', function (done) {
            execute(api, {}, dst, function (err) {
                expect(err).to.eql(null);
                done();
            });
        });

        it('returns the correct result', function (done) {
            execute(api, {}, dst, function (err, result) {
                expect(result).to.eql([
                    {
                        attributePath: [],
                        dataSourceName: 'ds',
                        data: [],
                        totalCount: null
                    }
                ]);
                done();
            });
        });
    });

    describe('subFilters', function () {
        var dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'user',
                filter: [
                    [
                        { attribute: 'id', operator: 'equal', valueFromSubFilter: true }
                    ]
                ]
            },
            subFilters: [
                {
                    parentKey: ['id'],
                    childKey: ['userId'],
                    request: {
                        type: 'test',
                        table: 'email'
                    }
                }
            ]
        };

        describe('with non-empty result', function () {
            before(function () {
                sinon.stub(api.dataSources['test'], 'process', function (query, callback) {
                    if (query.table === 'email') {
                        return callback(null, {
                            data: [
                                { userId: 1, email: 'user1@example.com' },
                                { userId: 3, email: 'user3@example.com' }
                            ],
                            totalCount: null
                        });
                    }

                    if (query.table === 'user') {
                        // valueFromSubFilter is transformed correctly
                        expect(query.filter).to.eql([[
                            {
                                attribute: 'id',
                                operator: 'equal',
                                valueFromSubFilter: true,
                                value: [1, 3]
                            }
                        ]]);

                        return callback(null, {
                            data: [
                                { id: 1, username: 'user1' },
                                { id: 3, username: 'user3' }
                            ],
                            totalCount: null
                        });
                    }

                    callback(null, {
                        data: [],
                        totalCount: null
                    });
                });
            });

            after(function () {
                api.dataSources['test'].process.restore();
            });

            it('does not throw errors', function (done) {
                execute(api, {}, dst, function (err) {
                    if (err) throw err;
                    expect(err).to.eql(null);
                    done();
                });
            });

            it('returns the correct result', function (done) {
                execute(api, {}, dst, function (err, result) {
                    expect(result).to.eql([
                        {
                            attributePath: [],
                            dataSourceName: 'ds1',
                            data: [
                                { id: 1, username: 'user1' },
                                { id: 3, username: 'user3' }
                            ],
                            totalCount: null
                        }
                    ]);
                    done();
                });
            });
        });

        describe('with empty result', function () {
            before(function () {
                sinon.stub(api.dataSources['test'], 'process', function (query, callback) {
                    if (query.table === 'email') {
                        return callback(null, {
                            data: [],
                            totalCount: null
                        });
                    }

                    // other request should not be made
                    throw new Error('resource-executor should only make "email" request here');
                });
            });

            after(function () {
                api.dataSources['test'].process.restore();
            });

            it('does not throw errors', function (done) {
                execute(api, {}, dst, function (err) {
                    expect(err).to.eql(null);
                    done();
                });
            });

            it('returns an empty main result', function (done) {
                execute(api, {}, dst, function (err, result) {
                    expect(result).to.eql([
                        {
                            attributePath: [],
                            dataSourceName: 'ds1',
                            data: [],
                            totalCount: 0
                        }
                    ]);
                    done();
                });
            });
        });
    });

    describe('subRequests', function () {
        var dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'user'
            },
            subRequests: [
                {
                    attributePath: ['email'],
                    dataSourceName: 'ds2',
                    parentKey: ['id'],
                    childKey: ['userId'],
                    request: {
                        type: 'test',
                        table: 'email',
                        filter: [[{attribute: 'userId', operator: 'equal', valueFromParentKey: true}]]
                    }
                }
            ]
        };

        before(function() {
            sinon.stub(api.dataSources['test'], 'process', function (query, callback) {
                if (query.table === 'user') {
                    return callback(null, {
                        data: [
                            { id: 1, username: 'user1' },
                            { id: 2, username: 'user2' },
                            { id: 3, username: 'user3' }
                        ],
                        totalCount: null
                    });
                }

                if (query.table === 'email') {
                    // valueFromSubFilter is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'userId',
                            operator: 'equal',
                            valueFromParentKey: true,
                            value: [1, 2, 3]
                        }
                    ]]);

                    return callback(null, {
                        data: [
                            { userId: 1, email: 'user1@example.com' },
                            { userId: 3, email: 'user3@example.com' }
                        ],
                        totalCount: null
                    });
                }

                callback(null, {
                    data: [],
                    totalCount: null
                });
            });
        });

        after(function () {
            api.dataSources['test'].process.restore();
        });

        it('does not throw errors', function (done) {
            execute(api, {}, dst, function (err) {
                expect(err).to.eql(null);
                done();
            });
        });

        it('integration test', function (done) {
            execute(api, {}, dst, function (err, result) {
                expect(result).to.eql([
                    {
                        attributePath: [],
                        dataSourceName: 'ds1',
                        data: [
                            { id: 1, username: 'user1' },
                            { id: 2, username: 'user2' },
                            { id: 3, username: 'user3' }
                        ],
                        totalCount: null
                    },
                    {
                        attributePath: ['email'],
                        dataSourceName: 'ds2',
                        childKey: [ 'userId' ],
                        parentKey: [ 'id' ],
                        data: [
                            { userId: 1, email: 'user1@example.com' },
                            { userId: 3, email: 'user3@example.com' }
                        ],
                        totalCount: null
                    }
                ]);
                done();
            });
        });
    });

    describe('subRequests and subFilters', function () {
        var dst = {
            attributePath: [],
            request: {
                type: 'test',
                table: 'user',
                filter: [[{attribute: 'id', operator: 'equal', valueFromSubFilter: true}]]
            },
            subFilters: [
                {
                    parentKey: ['id'],
                    childKey: ['authorId'],
                    request: {
                        type: 'test',
                        table: 'article'
                    }
                }
            ],
            subRequests: [
                {
                    attributePath: ['email'],
                    parentKey: ['id'],
                    childKey: ['userId'],
                    request: {
                        type: 'test',
                        table: 'email',
                        filter: [[{attribute: 'userId', operator: 'equal', valueFromParentKey: true}]]
                    }
                }
            ]
        };

        before(function () {
            sinon.stub(api.dataSources['test'], 'process', function (query, callback) {
                if (query.table === 'article') {
                    return callback(null, {
                        data: [
                            {authorId: 1, id: 1001},
                            {authorId: 3, id: 1003}
                        ],
                        totalCount: null
                    });
                }

                if (query.table === 'email') {
                    // valueFromSubFilter is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'userId',
                            operator: 'equal',
                            valueFromParentKey: true,
                            value: [1, 3]
                        }
                    ]]);

                    return callback(null, {
                        data: [
                            {userId: 1, email: 'user1@example.com'}
                        ],
                        totalCount: null
                    });
                }

                if (query.table === 'user') {
                    return callback(null, {
                        data: [
                            { id: 1, username: 'user1' },
                            { id: 3, username: 'user3' }
                        ],
                        totalCount: null
                    });
                }

                callback(null, {
                    data: [],
                    totalCount: null
                });
            });
        });

        after(function () {
            api.dataSources['test'].process.restore();
        });

        it('does not throw errors', function (done) {
            execute(api, {}, dst, function (err) {
                expect(err).to.eql(null);
                done();
            });
        });

        it('returns the correct result', function (done) {
            execute(api, {}, dst, function (err, result) {
                expect(err).to.eql(null);
                expect(result).to.eql([
                    {
                        attributePath: [],
                        data: [
                            { id: 1, username: 'user1' },
                            { id: 3, username: 'user3' }
                        ],
                        totalCount: null
                    },
                    {
                        attributePath: ['email'],
                        childKey: [ 'userId' ],
                        parentKey: [ 'id' ],
                        data: [
                            { userId: 1, email: 'user1@example.com' }
                        ],
                        totalCount: null
                    }
                ]);
                done();
            });
        });
    });

    describe('recursive subFilters', function () {
        var dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'user',
                filter: [[{ attribute: 'id', operator: 'equal', valueFromSubFilter: true }]]
            },
            subFilters: [
                {
                    parentKey: ['id'],
                    childKey: ['userId'],
                    request: {
                        type: 'test',
                        table: 'email',
                        filter: [[{ attribute: 'userId', operator: 'equal', valueFromSubFilter: true}]]
                    },
                    subFilters: [
                        {
                            parentKey: ['userId'],
                            childKey: ['userId'],
                            request: {
                                type: 'test',
                                table: 'validemail',
                                filter: [[{ attribute: 'isValid', operator: 'equal', value: [1]}]]
                            }
                        }
                    ]
                }
            ]
        };

        before(function () {
            sinon.stub(api.dataSources['test'], 'process', function (query, callback) {
                if (query.table === 'validemail') {
                    // filter parameter is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'isValid',
                            operator: 'equal',
                            value: [1]
                        }
                    ]]);

                    return callback(null, {
                        data: [
                            { userId: 1 }
                        ],
                        totalCount: null
                    });
                }

                if (query.table === 'email') {
                    // valueFromSubFilter (validemail) is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'userId',
                            operator: 'equal',
                            valueFromSubFilter: true,
                            value: [1]
                        }
                    ]]);

                    return callback(null, {
                        data: [
                            { userId: 1, email: 'user1@example.com' }
                        ],
                        totalCount: null
                    });
                }

                if (query.table === 'user') {
                    // valueFromSubFilter is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'id',
                            operator: 'equal',
                            valueFromSubFilter: true,
                            value: [1]
                        }
                    ]]);

                    return callback(null, {
                        data: [
                            { id: 1, username: 'user1' }
                        ],
                        totalCount: null
                    });
                }

                callback(null, {
                    data: [],
                    totalCount: null
                });
            });
        });

        after(function () {
            api.dataSources['test'].process.restore();
        });

        it('does not throw errors', function (done) {
            execute(api, {}, dst, function (err) {
                expect(err).to.eql(null);
                done();
            });
        });

        it('returns the correct result', function (done) {
            execute(api, {}, dst, function (err, result) {
                expect(result).to.eql([
                    {
                        attributePath: [],
                        dataSourceName: 'ds1',
                        data: [
                            { id: 1, username: 'user1' }
                        ],
                        totalCount: null
                    }
                ]);
                done();
            });
        });
    });
});

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
                    if (err) return done(err);
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

    describe('type casting', function () {
        var dst = {
            attributePath: [],
            request: {
                type: 'test',
                table: 'user'
            },
            attributeOptions: {
                string2int: {type: 'int'},
                string2float: {type: 'float'},
                int2string: {type: 'string'},
                string2boolean1: {type: 'boolean'},
                string2boolean0: {type: 'boolean'},
                int2boolean1: {type: 'boolean'},
                int2boolean0: {type: 'boolean'},
                string2datetime: {type: 'datetime'},
                string2time: {type: 'datetime'},
                string2date: {type: 'datetime'},
                raw: {type: 'raw'},
                null2int: {type: 'int'},
                unknownType: {type: 'unknown'}
            }
        };

        before(function () {
            sinon.stub(api.dataSources['test'], 'process', function (query, callback) {
                return callback(null, {
                    data: [
                        {
                            string2int: '42',
                            string2float: '3.1415',
                            int2string: 42,
                            string2boolean1: '1',
                            string2boolean0: '0',
                            int2boolean1: 1,
                            int2boolean0: 0,
                            string2datetime: '2015-06-17 12:13:14',
                            string2time: '2015-06-17 12:13:14',
                            string2date: '2015-06-17 12:13:14',
                            raw: {foo: 'bar'},
                            null2int: null,
                            emptyType: {foo: 'bar'},
                            unknownType: {foo: 'bar'}
                        }
                    ],
                    totalCount: null
                });
            });
        });

        after(function () {
            api.dataSources['test'].process.restore();
        });

        it('supports type casting', function () {
            execute(api, {}, dst, function (err, result) {
                expect(err).to.eql(null);
                expect(result).to.be.an('array');
                expect(result[0]).to.be.an('object');
                expect(result[0].data).to.be.an('array');
                expect(result[0].data[0]).to.be.an('object');
            });
        });

        it('casts string to int', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].string2int).to.be.a('number');
                expect(result[0].data[0].string2int).to.equal(42);
            });
        });

        it('casts string to float', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].string2float).to.be.a('number');
                expect(result[0].data[0].string2float).to.equal(3.1415);
            });
        });

        it('casts int to string', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].int2string).to.be.a('string');
                expect(result[0].data[0].int2string).to.equal('42');
            });
        });

        it('casts string to boolean', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].string2boolean1).to.be.a('boolean');
                expect(result[0].data[0].string2boolean1).to.equal(true);
                expect(result[0].data[0].string2boolean0).to.be.a('boolean');
                expect(result[0].data[0].string2boolean0).to.equal(false);
            });
        });

        it('casts int to boolean', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].int2boolean1).to.be.a('boolean');
                expect(result[0].data[0].int2boolean1).to.equal(true);
                expect(result[0].data[0].int2boolean0).to.be.a('boolean');
                expect(result[0].data[0].int2boolean0).to.equal(false);
            });
        });

        it('casts string to datetime', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].string2datetime).to.be.a('string');
                expect(result[0].data[0].string2datetime).to.equal('2015-06-17T10:13:14.000Z');
            });
        });

        it('casts string to time', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].string2time).to.be.a('string');
                expect(result[0].data[0].string2time).to.equal('2015-06-17T10:13:14.000Z');
            });
        });

        it('casts string to date', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].string2date).to.be.a('string');
                expect(result[0].data[0].string2date).to.equal('2015-06-17T10:13:14.000Z');
            });
        });

        it('passes through raw data', function () {
            execute(api, {}, dst, function (err, result) {
                expect(result[0].data[0].raw).to.be.an('object');
                expect(result[0].data[0].raw).to.eql({foo: 'bar'});
            });
        });

        it('passes through null', function () {
            execute(api, {}, dst, function (err, result) {
                expect(err).to.eql(null);
                expect(result[0].data[0].null2int).to.equal(null);
            });
        });

        it('passes through empty type', function () {
            execute(api, {}, dst, function (err, result) {
                expect(err).to.eql(null);
                expect(result[0].data[0].emptyType).to.be.an('object');
                expect(result[0].data[0].emptyType).to.eql({foo: 'bar'});
            });
        });

        it('passes through unknown type', function () {
            execute(api, {}, dst, function (err, result) {
                expect(err).to.eql(null);
                expect(result[0].data[0].unknownType).to.be.an('object');
                expect(result[0].data[0].unknownType).to.eql({foo: 'bar'});
            });
        });
    });
});

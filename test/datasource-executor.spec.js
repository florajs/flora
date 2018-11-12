'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const execute = require('../lib/datasource-executor');

const testDataSource = function testDataSource() {
    return {
        process: async (request) => ({
            data: [],
            totalCount: null
        }),
        prepare: () => {}
    };
};

const api = {
    dataSources: {
        test: testDataSource()
    },

    getResource: () => {
        return null;
    }
};

describe('datasource-executor', () => {
    describe('generic tests', () => {
        it('should be a function', () => {
            expect(execute).to.be.a('function');
        });
    });

    describe('error handling', () => {
        it('returns error on invalid request type', (done) => {
            execute(api, {}, { request: { type: 'test-invalid'} })
                .catch((err) => {
                    expect(err).to.be.an.instanceof(Error);
                    done();
                });
        });

        it('passes through errors from process call', () => {
            sinon.stub(api.dataSources['test'], 'process').callsFake((query) => {
                throw new Error('foo');
            });

            const dst = {request: {type: 'test'}};

            execute(api, {}, dst)
                .catch((err) => {
                    api.dataSources['test'].process.restore();
                    expect(err).to.be.an.instanceof(Error);
                    expect(err.message).to.equal('foo');
                });
        });

        it('detects missing subFilters', (done) => {
            const dst = {
                request: {
                    type: 'test',
                    filter: [[{attribute: 'bar', operator: 'equal', valueFromSubFilter: true}]]
                }
            };

            execute(api, {}, dst)
                .catch((err) => {
                    expect(err).to.be.an.instanceof(Error);
                    expect(err.message).to.equal('Missing subFilter for attribute "bar"');
                    done();
                });
        });
    });

    describe('simple requests', () => {
        const dst = {
            attributePath: [],
            dataSourceName: 'ds',
            request: {
                type: 'test'
            }
        };

        it('does not throw errors', () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', async () => {
            const result = await execute(api, {}, dst);
            expect(result).to.eql([
                {
                    attributePath: [],
                    dataSourceName: 'ds',
                    data: [],
                    totalCount: null
                }
            ]);
        });
    });

    describe('subFilters', () => {
        const dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'user',
                filter: [
                    [
                        { attribute: 'id', operator: 'equal', valueFromSubFilter: 0 }
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

        describe('with non-empty result', () => {
            before(() => {
                sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                    if (query.table === 'email') {
                        return {
                            data: [
                                { userId: 1, email: 'user1@example.com' },
                                { userId: 3, email: 'user3@example.com' }
                            ],
                            totalCount: null
                        };
                    }

                    if (query.table === 'user') {
                        // valueFromSubFilter is transformed correctly
                        expect(query.filter).to.eql([[
                            {
                                attribute: 'id',
                                operator: 'equal',
                                valueFromSubFilter: 0,
                                value: [1, 3]
                            }
                        ]]);

                        return {
                            data: [
                                { id: 1, username: 'user1' },
                                { id: 3, username: 'user3' }
                            ],
                            totalCount: null
                        };
                    }

                    return {
                        data: [],
                        totalCount: null
                    };
                });
            });

            after(() => {
                api.dataSources['test'].process.restore();
            });

            it('does not throw errors', () => {
                return execute(api, {}, dst);
            });

            it('returns the correct result', () => {
                return execute(api, {}, dst)
                    .then((result) => {
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
                    });
            });
        });

        describe('with empty result', () => {
            before(() => {
                sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                    if (query.table === 'email') {
                        return {
                            data: [],
                            totalCount: null
                        };
                    }

                    // other request should not be made
                    throw new Error('resource-executor should only make "email" request here');
                });
            });

            after(() => {
                api.dataSources['test'].process.restore();
            });

            it('does not throw errors', () => {
                return execute(api, {}, dst);
            });

            it('returns an empty main result', () => {
                return execute(api, {}, dst)
                    .then((result) => {
                        expect(result).to.eql([
                            {
                                attributePath: [],
                                dataSourceName: 'ds1',
                                data: [],
                                totalCount: 0
                            }
                        ]);
                    });
            });
        });
    });

    describe('subRequests', () => {
        const dst = {
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

        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'user') {
                    return {
                        data: [
                            { id: 1, username: 'user1' },
                            { id: 2, username: 'user2' },
                            { id: 3, username: 'user3' }
                        ],
                        totalCount: null
                    };
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

                    return {
                        data: [
                            { userId: 1, email: 'user1@example.com' },
                            { userId: 3, email: 'user3@example.com' }
                        ],
                        totalCount: null
                    };
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        it('does not throw errors', () => {
            return execute(api, {}, dst);
        });

        it('integration test', () => {
            return execute(api, {}, dst)
                .then((result) => {
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
                });
        });
    });

    describe('subRequests with empty condition (null)', () => {
        const dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'article'
            },
            subRequests: [
                {
                    attributePath: ['author'],
                    dataSourceName: 'ds2',
                    parentKey: ['authorId'],
                    childKey: ['id'],
                    request: {
                        type: 'test',
                        table: 'user',
                        filter: [[{attribute: 'id', operator: 'equal', valueFromParentKey: true}]]
                    }
                }
            ]
        };

        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'article') {
                    return {
                        data: [
                            {id: 1, authorId: null},
                            {id: 2, authorId: null}
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    // As authorId is always null, no user needs to be fetched
                    throw new Error('This should not be called');
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        it('does not execute the subRequest', () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result).to.eql([
                        {
                            attributePath: [],
                            dataSourceName: 'ds1',
                            data: [{id: 1, authorId: null}, {id: 2, authorId: null}],
                            totalCount: null
                        },
                        {
                            attributePath: ['author'],
                            dataSourceName: 'ds2',
                            data: [],
                            childKey: ['id'],
                            parentKey: ['authorId'],
                            totalCount: 0
                        }
                    ]);
                });
        });
    });

    describe('subRequests with empty condition (undefined)', () => {
        // In some cases, dataSources (e.g. Solr) may not return fields if they do not exist
        const dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'article'
            },
            subRequests: [
                {
                    attributePath: ['author'],
                    dataSourceName: 'ds2',
                    parentKey: ['authorId'],
                    childKey: ['id'],
                    request: {
                        type: 'test',
                        table: 'user',
                        filter: [[{attribute: 'id', operator: 'equal', valueFromParentKey: true}]]
                    }
                }
            ]
        };

        before(function() {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'article') {
                    return {
                        data: [
                            {id: 1},
                            {id: 2}
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    // As authorId is always null, no user needs to be fetched
                    throw new Error('This should not be called');
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        it('does not execute the subRequest', () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result).to.eql([
                        {
                            attributePath: [],
                            dataSourceName: 'ds1',
                            data: [{id: 1}, {id: 2}],
                            totalCount: null
                        },
                        {
                            attributePath: ['author'],
                            dataSourceName: 'ds2',
                            data: [],
                            childKey: ['id'],
                            parentKey: ['authorId'],
                            totalCount: 0
                        }
                    ]);
                });
        });
    });

    describe('subRequests with empty condition part (undefined)', () => {
        const dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'article'
            },
            subRequests: [
                {
                    attributePath: ['author'],
                    dataSourceName: 'ds2',
                    parentKey: ['authorId'],
                    childKey: ['id'],
                    request: {
                        type: 'test',
                        table: 'user',
                        filter: [[{attribute: 'id', operator: 'equal', valueFromParentKey: true}]]
                    }
                }
            ]
        };

        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'article') {
                    return {
                        data: [
                            {id: 1}, // no authorId
                            {id: 2, authorId: 1000}
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'id',
                            operator: 'equal',
                            valueFromParentKey: true,
                            value: [1000]
                        }
                    ]]);

                    return {
                        data: [
                            {id: 1000, username: 'user2@example.com'}
                        ],
                        totalCount: null
                    };
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        it('does not execute the subRequest', () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result).to.eql([
                        {
                            attributePath: [],
                            dataSourceName: 'ds1',
                            data: [{id: 1}, {id: 2, authorId: 1000}],
                            totalCount: null
                        },
                        {
                            attributePath: ['author'],
                            dataSourceName: 'ds2',
                            parentKey: ['authorId'],
                            childKey: ['id'],
                            data: [{id: 1000, username: 'user2@example.com'}],
                            totalCount: null
                        }
                    ]);
                });
        });
    });

    describe('subRequests and subFilters', () => {
        const dst = {
            attributePath: [],
            request: {
                type: 'test',
                table: 'user',
                filter: [[{attribute: 'id', operator: 'equal', valueFromSubFilter: 0}]]
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

        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'article') {
                    return {
                        data: [
                            {authorId: 1, id: 1001},
                            {authorId: 3, id: 1003}
                        ],
                        totalCount: null
                    };
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

                    return {
                        data: [
                            {userId: 1, email: 'user1@example.com'}
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    return {
                        data: [
                            { id: 1, username: 'user1' },
                            { id: 3, username: 'user3' }
                        ],
                        totalCount: null
                    };
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        it('does not throw errors', () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', () => {
            return execute(api, {}, dst)
                .then((result) => {
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
                });
        });
    });

    describe('recursive subFilters', () => {
        const dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'user',
                filter: [[{ attribute: 'id', operator: 'equal', valueFromSubFilter: 0 }]]
            },
            subFilters: [
                {
                    parentKey: ['id'],
                    childKey: ['userId'],
                    request: {
                        type: 'test',
                        table: 'email',
                        filter: [[{ attribute: 'userId', operator: 'equal', valueFromSubFilter: 0}]]
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

        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'validemail') {
                    // filter parameter is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'isValid',
                            operator: 'equal',
                            value: [1]
                        }
                    ]]);

                    return {
                        data: [
                            { userId: 1 }
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'email') {
                    // valueFromSubFilter (validemail) is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'userId',
                            operator: 'equal',
                            valueFromSubFilter: 0,
                            value: [1]
                        }
                    ]]);

                    return {
                        data: [
                            { userId: 1, email: 'user1@example.com' }
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    // valueFromSubFilter is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'id',
                            operator: 'equal',
                            valueFromSubFilter: 0,
                            value: [1]
                        }
                    ]]);

                    return {
                        data: [
                            { id: 1, username: 'user1' }
                        ],
                        totalCount: null
                    };
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        it('does not throw errors', () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', () => {
            return execute(api, {}, dst)
                .then((result) => {
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
                });
        });
    });

    describe('type casting in requests', () => {
        const dst = {
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
                string2datetime: {type: 'datetime', storedType: {type: 'datetime', options: {timezone: 'Europe/Berlin'}}},
                string2time: {type: 'time', storedType: {type: 'datetime', options: {timezone: 'Europe/Berlin'}}},
                string2date: {type: 'date', storedType: {type: 'datetime', options: {timezone: 'Europe/Berlin'}}},
                raw: {type: 'raw'},
                null2int: {type: 'int'},
                unknownType: {type: 'unknown'}
            }
        };

        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async () => {
                return {
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
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        it('supports type casting', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result).to.be.an('array');
                    expect(result[0]).to.be.an('object');
                    expect(result[0].data).to.be.an('array');
                    expect(result[0].data[0]).to.be.an('object');
                });
        });

        it('casts string to int', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].string2int).to.be.a('number');
                    expect(result[0].data[0].string2int).to.equal(42);
                });
        });

        it('casts string to float', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].string2float).to.be.a('number');
                    expect(result[0].data[0].string2float).to.equal(3.1415);
                });
        });

        it('casts int to string', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].int2string).to.be.a('string');
                    expect(result[0].data[0].int2string).to.equal('42');
                });
        });

        it('casts string to boolean ("1")', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].string2boolean1).to.be.a('boolean');
                    expect(result[0].data[0].string2boolean1).to.equal(true);
                });
        });

        it('casts string to boolean ("0")', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].string2boolean0).to.be.a('boolean');
                    expect(result[0].data[0].string2boolean0).to.equal(false);
                });
        });

        it('casts int to boolean (1)', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].int2boolean1).to.be.a('boolean');
                    expect(result[0].data[0].int2boolean1).to.equal(true);
                });
        });

        it('casts int to boolean (0)', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].int2boolean0).to.be.a('boolean');
                    expect(result[0].data[0].int2boolean0).to.equal(false);
                });
        });

        it('casts string to datetime', () => {
            execute(api, {}, dst, (err, result) => {
                expect(result[0].data[0].string2datetime).to.be.a('string');
                expect(result[0].data[0].string2datetime).to.equal('2015-06-17T10:13:14.000Z');
            });
        });

        it('casts string to time', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].string2time).to.be.a('string');
                    expect(result[0].data[0].string2time).to.equal('10:13:14.000Z');
                });
        });

        it('casts string to date', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].string2date).to.be.a('string');
                    expect(result[0].data[0].string2date).to.equal('2015-06-17');
                });
        });

        it('passes through raw data', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].raw).to.be.an('object');
                    expect(result[0].data[0].raw).to.eql({foo: 'bar'});
                });
        });

        it('passes through null', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].null2int).to.equal(null);
                });
        });

        it('passes through empty type', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].emptyType).to.be.an('object');
                    expect(result[0].data[0].emptyType).to.eql({foo: 'bar'});
                });
        });

        it('passes through unknown type', () => {
            return execute(api, {}, dst)
                .then((result) => {
                    expect(result[0].data[0].unknownType).to.be.an('object');
                    expect(result[0].data[0].unknownType).to.eql({foo: 'bar'});
                });
        });
    });

    describe('delimiter in subFilters', () => {
        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'email') {
                    // valueFromSubFilter (validemail) is transformed correctly
                    expect(query.filter).to.eql([[
                        {
                            attribute: 'userId',
                            operator: 'equal',
                            valueFromParentKey: true,
                            value: [10, 11, 12, 20, 21]
                        }
                    ]]);

                    return {
                        data: [
                            {id: 10, email: 'user1-0@example.com'},
                            {id: 11, email: 'user1-1@example.com'},
                            {id: 20, email: 'user2-0@example.com'},
                            {id: 21, email: 'user2-1@example.com'}
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    return {
                        data: [
                            {id: 1, emailIds: '10,11,12'},
                            {id: 2, emailIds: '20,21'}
                        ],
                        totalCount: null
                    }
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        const dst = {
            attributePath: [],
            dataSourceName: 'user',
            request: {
                type: 'test',
                table: 'user',
                attributes: ['id', 'emailIds']
            },
            attributeOptions: {
                emailIds: {
                    type: 'int',
                    delimiter: ',',
                    multiValued: true
                },
                userId: {
                    type: 'int',
                    storedType: {type: 'string'}
                }
            },
            subRequests: [
                {
                    attributePath: ['email'],
                    dataSourceName: 'ds2',
                    parentKey: ['emailIds'],
                    childKey: ['id'],
                    request: {
                        type: 'test',
                        table: 'email',
                        attributes: ['id', 'email'],
                        filter: [[{attribute: 'userId', operator: 'equal', valueFromParentKey: true}]]
                    }
                }
            ]
        };

        it('does not throw errors', () => {
            return execute(api, {}, dst);
        });

        it('resolves emailIds', () => {
            return execute(api, {}, dst)
                .then((results) => {
                    expect(results[0].data).to.eql([
                        { id: 1, emailIds: [ 10, 11, 12 ] },
                        { id: 2, emailIds: [ 20, 21 ] }
                    ]);
                });
        });

        it('resolves email entries', function () {
            return execute(api, {}, dst)
                .then((results) => {
                    expect(results[1].data).to.eql([
                        { id: 10, email: 'user1-0@example.com' },
                        { id: 11, email: 'user1-1@example.com' },
                        { id: 20, email: 'user2-0@example.com' },
                        { id: 21, email: 'user2-1@example.com' }
                    ]);
                });
        });
    });

    describe('casting to storedType in subFilters', () => {
        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'quotes') {
                    return {
                        data: [
                            {instrumentId: 1, exchangeId: 10, value: 1000},
                            {instrumentId: 1, exchangeId: 20, value: 2000},
                            {instrumentId: 2, exchangeId: 30, value: 3000}
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'instruments') {
                    expect(query.filter).to.eql([[
                        {
                            attribute: ['id', 'exchangeId'],
                            operator: 'equal',
                            valueFromSubFilter: 0,
                            value: [[1], ['2']]
                        }
                    ]]);
                    return {
                        data: [],
                        totalCount: null
                    };
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        const dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'instruments',
                filter: [
                    [
                        {attribute: ['id', 'exchangeId'], operator: 'equal', valueFromSubFilter: 0}
                    ]
                ]
            },
            attributeOptions: {
                exchangeId: {
                    type: 'int',
                    storedType: {type: 'string'}
                }
            },
            subFilters: [
                {
                    parentKey: ['id', 'exchangeId'],
                    childKey: ['instrumentId'],
                    request: {
                        type: 'test',
                        table: 'quotes'
                    }
                }
            ]
        };

        it('does not throw errors', () => {
            return execute(api, {}, dst);
        });
    });

    describe('type casting in subFilters', () => {
        let dst;

        beforeEach(() => {
            dst = {
                attributePath: [],
                request: {
                    type: 'test',
                    table: 'article',
                    filter: [[{ attribute: 'authorId', operator: 'equal', valueFromSubFilter: 0 }]],
                    _expect: '__EXPECT__'
                },
                subFilters: [{
                    parentKey: ['authorId'],
                    childKey: ['id'],
                    request: {
                        type: 'test',
                        table: 'user',
                        _value: '__VALUE__'
                    },
                    attributeOptions: {
                        id: {type: '__TYPE__'}
                    }
                }]
            };
        });

        before(() => {
            sinon.stub(api.dataSources['test'], 'process').callsFake(async (query) => {
                if (query.table === 'article') {
                    expect(query).to.be.an('object');
                    expect(query.filter).to.be.an('array');
                    expect(query.filter.length).to.equal(1);
                    expect(query.filter[0]).to.be.an('array');
                    expect(query.filter[0][0].value).to.be.an('array');
                    expect(query.filter[0][0].value.length).to.equal(1);
                    expect(query.filter[0][0].value[0]).to.eql(query._expect);

                    return { data: [] };
                }

                return {
                    data: [{id: query._value}],
                    totalCount: null
                };
            });
        });

        after(() => {
            api.dataSources['test'].process.restore();
        });

        it('casts string to int', () => {
            dst.request._expect = 42;
            dst.subFilters[0].request._value = '42';
            dst.subFilters[0].attributeOptions.id.type = 'int';
            return execute(api, {}, dst);
        });

        it('casts string to float', () => {
            // this does not really make sense, but works
            dst.request._expect = 3.1415;
            dst.subFilters[0].request._value = '3.1415';
            dst.subFilters[0].attributeOptions.id.type = 'float';
            return execute(api, {}, dst);
        });

        it('casts int to string', () => {
            dst.request._expect = '42'
            dst.subFilters[0].request._value = 42;
            dst.subFilters[0].attributeOptions.id.type = 'string';
            return execute(api, {}, dst);
        });

        it('casts string to boolean ("1")', () => {
            dst.request._expect = true;
            dst.subFilters[0].request._value = '1';
            dst.subFilters[0].attributeOptions.id.type = 'boolean';
            return execute(api, {}, dst);
        });

        it('casts string to boolean ("0")', () => {
            dst.request._expect = false;
            dst.subFilters[0].request._value = '0';
            dst.subFilters[0].attributeOptions.id.type = 'boolean';
            return execute(api, {}, dst);
        });

        it('casts int to boolean (1)', () => {
            dst.request._expect = true;
            dst.subFilters[0].request._value = 1;
            dst.subFilters[0].attributeOptions.id.type = 'boolean';
            return execute(api, {}, dst);
        });

        it('casts int to boolean (0)', () => {
            dst.request._expect = false;
            dst.subFilters[0].request._value = 0;
            dst.subFilters[0].attributeOptions.id.type = 'boolean';
            return execute(api, {}, dst);
        });

        it('casts string to datetime (with timezone)', () => {
            dst.request._expect = '2015-06-17T10:13:14.000Z';
            dst.subFilters[0].request._value = '2015-06-17 12:13:14';
            dst.subFilters[0].attributeOptions.id.type = 'datetime';
            dst.subFilters[0].attributeOptions.id.storedType = {type: 'datetime', options: {timezone: 'Europe/Berlin'}};
            return execute(api, {}, dst);
        });

        it('casts string to datetime (with timezone)', () => {
            dst.request._expect = '2015-06-17T16:13:14.000Z';
            dst.subFilters[0].request._value = '2015-06-17 12:13:14';
            dst.subFilters[0].attributeOptions.id.type = 'datetime';
            dst.subFilters[0].attributeOptions.id.storedType = {type: 'datetime', options: {timezone: 'America/New_York'}};
            return execute(api, {}, dst);
        });

        it('casts string to time (with different timezone)', () => {
            dst.request._expect = '10:13:14.000Z';
            dst.subFilters[0].request._value = '2015-06-17 12:13:14';
            dst.subFilters[0].attributeOptions.id.type = 'time';
            dst.subFilters[0].attributeOptions.id.storedType = {type: 'datetime', options: {timezone: 'Europe/Berlin'}};
            return execute(api, {}, dst);
        });

        it('casts string to date (with timezone)', () => {
            dst.request._expect = '2015-06-17';
            dst.subFilters[0].request._value = '2015-06-17 12:13:14';
            dst.subFilters[0].attributeOptions.id.type = 'date';
            dst.subFilters[0].attributeOptions.id.storedType = {type: 'datetime', options: {timezone: 'Europe/Berlin'}};
            return execute(api, {}, dst);
        });

        it('passes through null', () => {
            // this may or may not make sense
            dst.request._expect = null;
            dst.subFilters[0].request._value = null;
            dst.subFilters[0].attributeOptions.id.type = 'int';
            return execute(api, {}, dst);
        });
    });
});

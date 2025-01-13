'use strict';

const { describe, it, mock, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const execute = require('../lib/datasource-executor');

const testDataSource = function testDataSource() {
    return {
        process: async (/* request */) => ({
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
            assert.equal(typeof execute, 'function');
        });
    });

    describe('error handling', () => {
        it('returns error on invalid request type', async () => {
            await assert.rejects(execute(api, {}, { request: { type: 'test-invalid' } }), Error);
        });

        it('passes through errors from process call', async (ctx) => {
            ctx.mock.method(api.dataSources['test'], 'process', async () => Promise.reject(new Error('foo')));

            const dst = { request: { type: 'test' } };

            await assert.rejects(execute(api, {}, dst), new Error('foo'));
        });

        it('detects missing subFilters', async () => {
            const dst = {
                request: {
                    type: 'test',
                    filter: [[{ attribute: 'bar', operator: 'equal', valueFromSubFilter: true }]]
                }
            };

            await assert.rejects(() => execute(api, {}, dst), new Error('Missing subFilter for attribute "bar"'));
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

        it('does not throw errors', async () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', async () => {
            const result = await execute(api, {}, dst);
            assert.deepEqual(result, [
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
                filter: [[{ attribute: 'id', operator: 'equal', valueFromSubFilter: 0 }]]
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
                mock.method(api.dataSources['test'], 'process', async (query) => {
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
                        assert.deepEqual(query.filter, [
                            [
                                {
                                    attribute: 'id',
                                    operator: 'equal',
                                    valueFromSubFilter: 0,
                                    value: [1, 3]
                                }
                            ]
                        ]);

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
                mock.restoreAll();
            });

            it('does not throw errors', () => {
                return execute(api, {}, dst);
            });

            it('returns the correct result', async () => {
                const result = await execute(api, {}, dst);
                assert.deepEqual(result, [
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

        describe('with empty result', () => {
            before(() => {
                mock.method(api.dataSources['test'], 'process', async (query) => {
                    if (query.table === 'email') {
                        return {
                            data: [],
                            totalCount: null
                        };
                    }

                    // other request should not be made
                    return Promise.reject(new Error('resource-executor should only make "email" request here'));
                });
            });

            after(() => {
                mock.restoreAll();
            });

            it('does not throw errors', async () => {
                return execute(api, {}, dst);
            });

            it('returns an empty main result', async () => {
                const result = await execute(api, {}, dst);
                assert.deepEqual(result, [
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
                        filter: [[{ attribute: 'userId', operator: 'equal', valueFromParentKey: true }]]
                    }
                }
            ]
        };

        before(() => {
            mock.method(api.dataSources['test'], 'process', async (query) => {
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
                    assert.deepEqual(query.filter, [
                        [
                            {
                                attribute: 'userId',
                                operator: 'equal',
                                valueFromParentKey: true,
                                value: [1, 2, 3]
                            }
                        ]
                    ]);

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
            mock.restoreAll();
        });

        it('does not throw errors', async () => {
            return execute(api, {}, dst);
        });

        it('integration test', async () => {
            const result = await execute(api, {}, dst);
            assert.deepEqual(result, [
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
                    childKey: ['userId'],
                    parentKey: ['id'],
                    data: [
                        { userId: 1, email: 'user1@example.com' },
                        { userId: 3, email: 'user3@example.com' }
                    ],
                    totalCount: null
                }
            ]);
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
                        filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                    },
                    extensions: {
                        preExecute: [
                            {
                                ds2: (ev) => {
                                    assert.deepEqual(ev.request.filter, [
                                        [
                                            {
                                                attribute: 'id',
                                                operator: 'equal',
                                                valueFromParentKey: true,
                                                value: []
                                            }
                                        ]
                                    ]);
                                }
                            }
                        ]
                    }
                }
            ]
        };

        before(() => {
            mock.method(api.dataSources['test'], 'process', async (query) => {
                if (query.table === 'article') {
                    return {
                        data: [
                            { id: 1, authorId: null },
                            { id: 2, authorId: null }
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    // As authorId is always null, no user needs to be fetched
                    return Promise.reject(new Error('This should not be called'));
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            mock.restoreAll();
        });

        it('does not execute the subRequest', async () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', async () => {
            const result = await execute(api, {}, dst);
            assert.deepEqual(result, [
                {
                    attributePath: [],
                    dataSourceName: 'ds1',
                    data: [
                        { id: 1, authorId: null },
                        { id: 2, authorId: null }
                    ],
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
                        filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                    }
                }
            ]
        };

        before(function () {
            mock.method(api.dataSources['test'], 'process', async (query) => {
                if (query.table === 'article') {
                    return {
                        data: [{ id: 1 }, { id: 2 }],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    // As authorId is always null, no user needs to be fetched
                    return Promise.reject(new Error('This should not be called'));
                }

                return {
                    data: [],
                    totalCount: null
                };
            });
        });

        after(() => {
            mock.restoreAll();
        });

        it('does not execute the subRequest', async () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', async () => {
            const result = await execute(api, {}, dst);
            assert.deepEqual(result, [
                {
                    attributePath: [],
                    dataSourceName: 'ds1',
                    data: [{ id: 1 }, { id: 2 }],
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
                        filter: [[{ attribute: 'id', operator: 'equal', valueFromParentKey: true }]]
                    }
                }
            ]
        };

        before(() => {
            mock.method(api.dataSources['test'], 'process', async (query) => {
                if (query.table === 'article') {
                    return {
                        data: [
                            { id: 1 }, // no authorId
                            { id: 2, authorId: 1000 }
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    assert.deepEqual(query.filter, [
                        [
                            {
                                attribute: 'id',
                                operator: 'equal',
                                valueFromParentKey: true,
                                value: [1000]
                            }
                        ]
                    ]);

                    return {
                        data: [{ id: 1000, username: 'user2@example.com' }],
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
            mock.restoreAll();
        });

        it('does not execute the subRequest', async () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', async () => {
            const result = await execute(api, {}, dst);
            assert.deepEqual(result, [
                {
                    attributePath: [],
                    dataSourceName: 'ds1',
                    data: [{ id: 1 }, { id: 2, authorId: 1000 }],
                    totalCount: null
                },
                {
                    attributePath: ['author'],
                    dataSourceName: 'ds2',
                    parentKey: ['authorId'],
                    childKey: ['id'],
                    data: [{ id: 1000, username: 'user2@example.com' }],
                    totalCount: null
                }
            ]);
        });
    });

    describe('subRequests and subFilters', () => {
        const dst = {
            attributePath: [],
            request: {
                type: 'test',
                table: 'user',
                filter: [[{ attribute: 'id', operator: 'equal', valueFromSubFilter: 0 }]]
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
                        filter: [[{ attribute: 'userId', operator: 'equal', valueFromParentKey: true }]]
                    }
                }
            ]
        };

        before(() => {
            mock.method(api.dataSources['test'], 'process', async (query) => {
                if (query.table === 'article') {
                    return {
                        data: [
                            { authorId: 1, id: 1001 },
                            { authorId: 3, id: 1003 }
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'email') {
                    // valueFromSubFilter is transformed correctly
                    assert.deepEqual(query.filter, [
                        [
                            {
                                attribute: 'userId',
                                operator: 'equal',
                                valueFromParentKey: true,
                                value: [1, 3]
                            }
                        ]
                    ]);

                    return {
                        data: [{ userId: 1, email: 'user1@example.com' }],
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
            mock.restoreAll();
        });

        it('does not throw errors', async () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', async () => {
            const result = await execute(api, {}, dst);
            assert.deepEqual(result, [
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
                    childKey: ['userId'],
                    parentKey: ['id'],
                    data: [{ userId: 1, email: 'user1@example.com' }],
                    totalCount: null
                }
            ]);
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
                        filter: [[{ attribute: 'userId', operator: 'equal', valueFromSubFilter: 0 }]]
                    },
                    subFilters: [
                        {
                            parentKey: ['userId'],
                            childKey: ['userId'],
                            request: {
                                type: 'test',
                                table: 'validemail',
                                filter: [[{ attribute: 'isValid', operator: 'equal', value: [1] }]]
                            }
                        }
                    ]
                }
            ]
        };

        before(() => {
            mock.method(api.dataSources['test'], 'process', async (query) => {
                if (query.table === 'validemail') {
                    // filter parameter is transformed correctly
                    assert.deepEqual(query.filter, [
                        [
                            {
                                attribute: 'isValid',
                                operator: 'equal',
                                value: [1]
                            }
                        ]
                    ]);

                    return {
                        data: [{ userId: 1 }],
                        totalCount: null
                    };
                }

                if (query.table === 'email') {
                    // valueFromSubFilter (validemail) is transformed correctly
                    assert.deepEqual(query.filter, [
                        [
                            {
                                attribute: 'userId',
                                operator: 'equal',
                                valueFromSubFilter: 0,
                                value: [1]
                            }
                        ]
                    ]);

                    return {
                        data: [{ userId: 1, email: 'user1@example.com' }],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    // valueFromSubFilter is transformed correctly
                    assert.deepEqual(query.filter, [
                        [
                            {
                                attribute: 'id',
                                operator: 'equal',
                                valueFromSubFilter: 0,
                                value: [1]
                            }
                        ]
                    ]);

                    return {
                        data: [{ id: 1, username: 'user1' }],
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
            mock.restoreAll();
        });

        it('does not throw errors', async () => {
            return execute(api, {}, dst);
        });

        it('returns the correct result', async () => {
            const result = await execute(api, {}, dst);
            assert.deepEqual(result, [
                {
                    attributePath: [],
                    dataSourceName: 'ds1',
                    data: [{ id: 1, username: 'user1' }],
                    totalCount: null
                }
            ]);
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
                string2int: { type: 'int' },
                string2float: { type: 'float' },
                int2string: { type: 'string' },
                string2boolean1: { type: 'boolean' },
                string2boolean0: { type: 'boolean' },
                int2boolean1: { type: 'boolean' },
                int2boolean0: { type: 'boolean' },
                string2datetime: {
                    type: 'datetime',
                    storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                },
                string2time: { type: 'time', storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } } },
                string2date: { type: 'date', storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } } },
                raw: { type: 'raw' },
                null2int: { type: 'int' },
                unknownType: { type: 'unknown' }
            }
        };

        before(() => {
            mock.method(api.dataSources['test'], 'process', async () => {
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
                            raw: { foo: 'bar' },
                            null2int: null,
                            emptyType: { foo: 'bar' },
                            unknownType: { foo: 'bar' }
                        }
                    ],
                    totalCount: null
                };
            });
        });

        after(() => {
            mock.restoreAll();
        });

        it('supports type casting', async () => {
            const result = await execute(api, {}, dst);
            assert.ok(Array.isArray(result));
            assert.equal(typeof result[0], 'object');
            assert.ok(Array.isArray(result[0].data));
            assert.equal(typeof result[0].data[0], 'object');
        });

        it('casts string to int', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].string2int, 'number');
            assert.equal(result[0].data[0].string2int, 42);
        });

        it('casts string to float', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].string2float, 'number');
            assert.equal(result[0].data[0].string2float, 3.1415);
        });

        it('casts int to string', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].int2string, 'string');
            assert.equal(result[0].data[0].int2string, '42');
        });

        it('casts string to boolean ("1")', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].string2boolean1, 'boolean');
            assert.equal(result[0].data[0].string2boolean1, true);
        });

        it('casts string to boolean ("0")', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].string2boolean0, 'boolean');
            assert.equal(result[0].data[0].string2boolean0, false);
        });

        it('casts int to boolean (1)', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].int2boolean1, 'boolean');
            assert.equal(result[0].data[0].int2boolean1, true);
        });

        it('casts int to boolean (0)', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].int2boolean0, 'boolean');
            assert.equal(result[0].data[0].int2boolean0, false);
        });

        it('casts string to datetime', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].string2datetime, 'string');
            assert.equal(result[0].data[0].string2datetime, '2015-06-17T10:13:14.000Z');
        });

        it('casts string to time', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].string2time, 'string');
            assert.equal(result[0].data[0].string2time, '10:13:14.000Z');
        });

        it('casts string to date', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].string2date, 'string');
            assert.equal(result[0].data[0].string2date, '2015-06-17');
        });

        it('passes through raw data', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].raw, 'object');
            assert.deepEqual(result[0].data[0].raw, { foo: 'bar' });
        });

        it('passes through null', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(result[0].data[0].null2int, null);
        });

        it('passes through empty type', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].emptyType, 'object');
            assert.deepEqual(result[0].data[0].emptyType, { foo: 'bar' });
        });

        it('passes through unknown type', async () => {
            const result = await execute(api, {}, dst);
            assert.equal(typeof result[0].data[0].unknownType, 'object');
            assert.deepEqual(result[0].data[0].unknownType, { foo: 'bar' });
        });
    });

    describe('delimiter in subFilters', () => {
        before(() => {
            mock.method(api.dataSources['test'], 'process', async (query) => {
                if (query.table === 'email') {
                    // valueFromSubFilter (validemail) is transformed correctly
                    assert.deepEqual(query.filter, [
                        [
                            {
                                attribute: 'userId',
                                operator: 'equal',
                                valueFromParentKey: true,
                                value: [10, 11, 12, 20, 21]
                            }
                        ]
                    ]);

                    return {
                        data: [
                            { id: 10, email: 'user1-0@example.com' },
                            { id: 11, email: 'user1-1@example.com' },
                            { id: 20, email: 'user2-0@example.com' },
                            { id: 21, email: 'user2-1@example.com' }
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'user') {
                    return {
                        data: [
                            { id: 1, emailIds: '10,11,12' },
                            { id: 2, emailIds: '20,21' }
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
            mock.restoreAll();
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
                    storedType: { type: 'string' }
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
                        filter: [[{ attribute: 'userId', operator: 'equal', valueFromParentKey: true }]]
                    }
                }
            ]
        };

        it('does not throw errors', async () => {
            return execute(api, {}, dst);
        });

        it('resolves emailIds', async () => {
            const results = await execute(api, {}, dst);
            assert.deepEqual(results[0].data, [
                { id: 1, emailIds: [10, 11, 12] },
                { id: 2, emailIds: [20, 21] }
            ]);
        });

        it('resolves email entries', async () => {
            const results = await execute(api, {}, dst);
            assert.deepEqual(results[1].data, [
                { id: 10, email: 'user1-0@example.com' },
                { id: 11, email: 'user1-1@example.com' },
                { id: 20, email: 'user2-0@example.com' },
                { id: 21, email: 'user2-1@example.com' }
            ]);
        });
    });

    describe('casting to storedType in subFilters', () => {
        before(() => {
            mock.method(api.dataSources['test'], 'process', async (query) => {
                if (query.table === 'quotes') {
                    return {
                        data: [
                            { instrumentId: 1, exchangeId: 10, value: 1000 },
                            { instrumentId: 1, exchangeId: 20, value: 2000 },
                            { instrumentId: 2, exchangeId: 30, value: 3000 }
                        ],
                        totalCount: null
                    };
                }

                if (query.table === 'instruments') {
                    assert.deepEqual(query.filter, [
                        [
                            {
                                attribute: ['id', 'exchangeId'],
                                operator: 'equal',
                                valueFromSubFilter: 0,
                                value: [[1], ['2']]
                            }
                        ]
                    ]);
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
            mock.restoreAll();
        });

        const dst = {
            attributePath: [],
            dataSourceName: 'ds1',
            request: {
                type: 'test',
                table: 'instruments',
                filter: [[{ attribute: ['id', 'exchangeId'], operator: 'equal', valueFromSubFilter: 0 }]]
            },
            attributeOptions: {
                exchangeId: {
                    type: 'int',
                    storedType: { type: 'string' }
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

        it('does not throw errors', async () => {
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
                subFilters: [
                    {
                        parentKey: ['authorId'],
                        childKey: ['id'],
                        request: {
                            type: 'test',
                            table: 'user',
                            _value: '__VALUE__'
                        },
                        attributeOptions: {
                            id: { type: '__TYPE__' }
                        }
                    }
                ]
            };
        });

        before(() => {
            mock.method(api.dataSources['test'], 'process', async (query) => {
                if (query.table === 'article') {
                    assert.equal(typeof query, 'object');
                    assert.ok(Array.isArray(query.filter));
                    assert.equal(query.filter.length, 1);
                    assert.ok(Array.isArray(query.filter[0]));
                    assert.ok(Array.isArray(query.filter[0][0].value));
                    assert.equal(query.filter[0][0].value.length, 1);
                    assert.equal(query.filter[0][0].value[0], query._expect);

                    return { data: [] };
                }

                return {
                    data: [{ id: query._value }],
                    totalCount: null
                };
            });
        });

        afterEach(() => {
            mock.restoreAll();
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
            dst.request._expect = '42';
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

        it('casts string to datetime (with timezone Europe/Berlin)', () => {
            dst.request._expect = '2015-06-17T10:13:14.000Z';
            dst.subFilters[0].request._value = '2015-06-17 12:13:14';
            dst.subFilters[0].attributeOptions.id.type = 'datetime';
            dst.subFilters[0].attributeOptions.id.storedType = {
                type: 'datetime',
                options: { timezone: 'Europe/Berlin' }
            };
            return execute(api, {}, dst);
        });

        it('casts string to datetime (with timezone America/New_York)', () => {
            dst.request._expect = '2015-06-17T16:13:14.000Z';
            dst.subFilters[0].request._value = '2015-06-17 12:13:14';
            dst.subFilters[0].attributeOptions.id.type = 'datetime';
            dst.subFilters[0].attributeOptions.id.storedType = {
                type: 'datetime',
                options: { timezone: 'America/New_York' }
            };
            return execute(api, {}, dst);
        });

        it('casts string to time (with different timezone)', () => {
            dst.request._expect = '10:13:14.000Z';
            dst.subFilters[0].request._value = '2015-06-17 12:13:14';
            dst.subFilters[0].attributeOptions.id.type = 'time';
            dst.subFilters[0].attributeOptions.id.storedType = {
                type: 'datetime',
                options: { timezone: 'Europe/Berlin' }
            };
            return execute(api, {}, dst);
        });

        it('casts string to date (with timezone)', () => {
            dst.request._expect = '2015-06-17';
            dst.subFilters[0].request._value = '2015-06-17 12:13:14';
            dst.subFilters[0].attributeOptions.id.type = 'date';
            dst.subFilters[0].attributeOptions.id.storedType = {
                type: 'datetime',
                options: { timezone: 'Europe/Berlin' }
            };
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

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const nullLogger = require('abstract-logging');

const Cast = require('../lib/cast');

const log = nullLogger;
log.child = () => log;

const api = {
    log,
    config: { timezone: 'UTC' }
};

const cast = new Cast(api);

describe('type casting', () => {
    describe('to "string"', () => {
        it('number to string', () => {
            assert.equal(cast.cast(100, { type: 'string' }), '100');
        });

        it('string to string', () => {
            assert.equal(cast.cast('100', { type: 'string' }), '100');
            assert.equal(cast.cast('test data', { type: 'string' }), 'test data');
        });

        it('Buffer to string', () => {
            assert.equal(cast.cast(Buffer.from('Abcäöüß'), { type: 'string' }), 'Abcäöüß');
        });
    });

    describe('to "int"', () => {
        it('number to int', () => {
            assert.equal(cast.cast(100, { type: 'int' }), 100);
        });

        it('string to int', () => {
            assert.equal(cast.cast('100', { type: 'int' }), 100);
        });

        it('invalid string to NaN', () => {
            assert.ok(isNaN(cast.cast('foo', { type: 'int' })));
        });

        it('Buffer to int', () => {
            assert.equal(cast.cast(Buffer.from('100'), { type: 'int' }), 100);
        });
    });

    describe('to "float"', () => {
        it('float to float', () => {
            assert.equal(cast.cast(100.1, { type: 'float' }), 100.1);
        });

        it('number to float', () => {
            assert.equal(cast.cast(100, { type: 'float' }), 100.0);
        });

        it('string to float', () => {
            assert.equal(cast.cast('100.1', { type: 'float' }), 100.1);
        });

        it('Buffer to float', () => {
            assert.equal(cast.cast(Buffer.from('100.1'), { type: 'float' }), 100.1);
        });
    });

    describe('to "boolean"', () => {
        it('boolean to boolean', () => {
            assert.equal(cast.cast(true, { type: 'boolean' }), true);
            assert.equal(cast.cast(false, { type: 'boolean' }), false);
        });

        it('number to boolean', () => {
            assert.equal(cast.cast(1, { type: 'boolean' }), true);
            assert.equal(cast.cast(0, { type: 'boolean' }), false);
        });

        it('string to boolean', () => {
            assert.equal(cast.cast('1', { type: 'boolean' }), true);
            assert.equal(cast.cast('0', { type: 'boolean' }), false);
        });

        it('Buffer to boolean', () => {
            assert.equal(cast.cast(Buffer.from('1'), { type: 'boolean' }), true);
            assert.equal(cast.cast(Buffer.from('0'), { type: 'boolean' }), false);
        });
    });

    describe('to "datetime"', () => {
        describe('without timezone', () => {
            it('invalid datetime values to null', () => {
                assert.equal(cast.cast('0000-00-00 00:00:00', { type: 'datetime' }), null);
                assert.equal(cast.cast('foo', { type: 'datetime' }), null);
                assert.equal(
                    cast.cast('03.03.2015 12:13:14', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    null
                );
            });

            it('string without timezone to datetime', () => {
                assert.equal(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'datetime'
                    }),
                    '2015-03-03T15:00:00.000Z'
                );
            });

            it('Buffer to datetime', () => {
                assert.equal(
                    cast.cast(Buffer.from('2015-03-03 15:00:00'), {
                        type: 'datetime'
                    }),
                    '2015-03-03T15:00:00.000Z'
                );
            });

            it('string (datetime) without timezone to datetime', () => {
                assert.equal(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2015-03-03T15:00:00.000Z'
                );
            });
        });

        describe('with timezone', () => {
            it('string (datetime, timezone=Europe/Berlin) to datetime', () => {
                assert.equal(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    }),
                    '2015-03-03T14:00:00.000Z'
                );

                assert.equal(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    }),
                    '2015-03-02T23:00:00.000Z'
                );
            });

            it('string (datetime, timezone=America/New_York) to datetime', () => {
                assert.equal(
                    cast.cast('2015-03-03 03:00:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                    }),
                    '2015-03-03T08:00:00.000Z'
                );
            });

            it('string (datetime with offset, ISO-8601 basic) to datetime', () => {
                assert.equal(
                    cast.cast('20090630T210000+0200', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2009-06-30T19:00:00.000Z'
                );
            });

            it('string (datetime with offset, ISO-8601 extended) to datetime', () => {
                assert.equal(
                    cast.cast('2009-06-30T21:00:00+02:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2009-06-30T19:00:00.000Z'
                );
            });

            it('string (datetime with offset, PHP DateTime::ISO8601) to datetime', () => {
                assert.equal(
                    cast.cast('2009-06-30T21:00:00+0200', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2009-06-30T19:00:00.000Z'
                );
            });
        });

        describe('with api.config.timezone', () => {
            let savedTimezone;

            before(() => {
                savedTimezone = api.config.timezone;
            });

            after(() => {
                api.config.timezone = savedTimezone;
            });

            it('string (datetime) without timezone to datetime (UTC)', () => {
                api.config.timezone = 'UTC';
                assert.equal(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2019-02-19T14:28:00.000Z'
                );
            });

            it('string (datetime) without timezone to datetime (Europe/Berlin)', () => {
                api.config.timezone = 'Europe/Berlin';
                assert.equal(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2019-02-19T14:28:00.000+01:00'
                );
            });
        });

        describe('with api.config.defaultStoredTimezone', () => {
            let savedTimezone;
            let savedStoredTimezone;

            before(() => {
                savedTimezone = api.config.timezone;
                savedStoredTimezone = api.config.defaultStoredTimezone;
            });

            after(() => {
                api.config.timezone = savedTimezone;
                api.config.defaultStoredTimezone = savedStoredTimezone;
            });

            it('string (datetime) without timezone (default=undefined) to datetime (UTC)', () => {
                api.config.timezone = 'UTC';
                // api.config.defaultStoredTimezone = undefined;
                assert.equal(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2019-02-19T14:28:00.000Z'
                );
            });

            it('string (datetime) without timezone (default=UTC) to datetime (UTC)', () => {
                api.config.timezone = 'UTC';
                api.config.defaultStoredTimezone = 'UTC';
                assert.equal(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2019-02-19T14:28:00.000Z'
                );
            });

            it('string (datetime) without timezone (default=Europe/Berlin) to datetime (UTC)', () => {
                api.config.timezone = 'UTC';
                api.config.defaultStoredTimezone = 'Europe/Berlin';
                assert.equal(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    }),
                    '2019-02-19T13:28:00.000Z'
                );
            });
        });

        describe('from unixtime', () => {
            it('number (unixtime) to datetime', () => {
                assert.equal(
                    cast.cast(1474371990, {
                        type: 'datetime',
                        storedType: { type: 'unixtime' }
                    }),
                    '2016-09-20T11:46:30.000Z'
                );
            });

            it('string (unixtime) to datetime', () => {
                assert.equal(
                    cast.cast('1474371990', {
                        type: 'datetime',
                        storedType: { type: 'unixtime' }
                    }),
                    '2016-09-20T11:46:30.000Z'
                );
            });
        });
    });

    describe('to "date"', () => {
        describe('without timezone', () => {
            it('invalid date values to null', () => {
                assert.equal(cast.cast('0000-00-00 00:00:00', { type: 'date' }), null);
                assert.equal(cast.cast('0000-00-00', { type: 'date' }), null);
                assert.equal(cast.cast(Buffer.from('0000-00-00 00:00:00'), { type: 'date' }), null);
                assert.equal(cast.cast(Buffer.from('0000-00-00'), { type: 'date' }), null);
                assert.equal(cast.cast('foo', { type: 'date' }), null);
            });

            it('string to date', () => {
                assert.equal(
                    cast.cast('2009-08-18', {
                        type: 'date'
                    }),
                    '2009-08-18'
                );
            });

            it('Buffer to date', () => {
                assert.equal(
                    cast.cast(Buffer.from('2009-08-18'), {
                        type: 'date'
                    }),
                    '2009-08-18'
                );
            });

            it('string (date) to date', () => {
                assert.equal(
                    cast.cast('2009-08-18', {
                        type: 'date',
                        storedType: { type: 'date' }
                    }),
                    '2009-08-18'
                );
            });

            it('string (datetime) to date', () => {
                assert.equal(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime' }
                    }),
                    '2015-03-03'
                );
            });

            it('string (date) with time to date', () => {
                assert.equal(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'date',
                        storedType: { type: 'date' }
                    }),
                    '2015-03-03'
                );

                assert.equal(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'date',
                        storedType: { type: 'date' }
                    }),
                    '2015-03-03'
                );

                assert.equal(
                    cast.cast('2015-03-03 01:00:00', {
                        type: 'date',
                        storedType: { type: 'date' }
                    }),
                    '2015-03-03'
                );

                assert.equal(
                    cast.cast('2015-03-03 23:00:00', {
                        type: 'date',
                        storedType: { type: 'date' }
                    }),
                    '2015-03-03'
                );
            });

            it('string (datetime) to date with storedType', () => {
                assert.equal(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime' }
                    }),
                    '2015-03-03'
                );

                assert.equal(
                    cast.cast('2015-03-03 01:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime' }
                    }),
                    '2015-03-03'
                );

                assert.equal(
                    cast.cast('2015-03-03 23:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime' }
                    }),
                    '2015-03-03'
                );
            });
        });

        describe('with timezone', () => {
            it('ignore invalid timezone', () => {
                assert.equal(
                    cast.cast('2009-08-18', {
                        type: 'date',
                        storedType: { type: 'date', options: { timezone: 'America/Bogus' } }
                    }),
                    null
                );
            });

            it('string (date, timezone=Europe/Berlin) to date', () => {
                assert.equal(
                    cast.cast('2009-08-18', {
                        type: 'date',
                        storedType: { type: 'date', options: { timezone: 'Europe/Berlin' } }
                    }),
                    '2009-08-18'
                );
            });

            it('string (datetime, timezone=Europe/Berlin) to date', () => {
                assert.equal(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    }),
                    '2015-03-03'
                );

                assert.equal(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    }),
                    '2015-03-03'
                );
            });

            it('string (datetime, timezone=America/New_York) to date', () => {
                assert.equal(
                    cast.cast('2015-03-03 03:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                    }),
                    '2015-03-03'
                );
            });

            it('string (date, timezone=Europe/Berlin) with time to date', () => {
                assert.equal(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'date',
                        storedType: { type: 'date', options: { timezone: 'Europe/Berlin' } }
                    }),
                    '2015-03-03'
                );
            });
        });

        describe('from "unixtime"', () => {
            it('number (unixtime) to date', () => {
                assert.equal(
                    cast.cast(1474371990, {
                        type: 'date',
                        storedType: { type: 'unixtime' }
                    }),
                    '2016-09-20'
                );
            });
        });
    });

    describe('to "time"', () => {
        it('invalid time values to null', () => {
            assert.equal(cast.cast('0000-00-00 00:00:00', { type: 'time' }), null);
            assert.equal(cast.cast('foo', { type: 'time' }), null);
        });

        describe('from "datetime"', () => {
            it('string (datetime, timezone=Europe/Berlin) to time', () => {
                assert.equal(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'time',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    }),
                    '14:00:00.000Z'
                );
                assert.equal(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'time',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    }),
                    '23:00:00.000Z'
                );
            });

            it('string (datetime, timezone=America/New_York) to time', () => {
                assert.equal(
                    cast.cast('2015-03-03 03:00:00', {
                        type: 'time',
                        storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                    }),
                    '08:00:00.000Z'
                );
            });
        });

        describe('from "unixtime"', () => {
            it('number (unixtime) to time', () => {
                assert.equal(
                    cast.cast(1474371990, {
                        type: 'time',
                        storedType: { type: 'unixtime' }
                    }),
                    '11:46:30.000Z'
                );
            });
        });
    });

    describe('to "unixtime"', () => {
        it('invalid date values to null', () => {
            assert.equal(cast.cast('0000-00-00 00:00:00', { type: 'unixtime' }), null);
            assert.equal(cast.cast('foo', { type: 'unixtime' }), null);
        });

        it('string to unixtime', () => {
            assert.equal(cast.cast('2016-09-20T11:46:30.000Z', { type: 'unixtime' }), 1474371990);
        });

        it('string to unixtime (rounded)', () => {
            assert.equal(cast.cast('2016-09-20T11:46:30.999Z', { type: 'unixtime' }), 1474371990);
        });

        it('Buffer to unixtime', () => {
            assert.equal(cast.cast(Buffer.from('2016-09-20T11:46:30.000Z'), { type: 'unixtime' }), 1474371990);
        });
    });

    describe('to "object"', () => {
        it('string (json) to object', () => {
            assert.deepEqual(cast.cast('{"foo":"bar"}', { storedType: { type: 'json' }, type: 'object' }), {
                foo: 'bar'
            });
        });

        it('Buffer (json) to object', () => {
            assert.deepEqual(
                cast.cast(Buffer.from('{"foo":"bar"}'), { storedType: { type: 'json' }, type: 'object' }),
                {
                    foo: 'bar'
                }
            );
        });

        it('invalid string (json) to null', () => {
            assert.equal(cast.cast('{"foo":"bar"broken', { storedType: { type: 'json' }, type: 'object' }), null);
        });

        it('object (object) to object', () => {
            assert.deepEqual(cast.cast({ foo: 'bar' }, { storedType: { type: 'object' }, type: 'object' }), {
                foo: 'bar'
            });
        });

        it('object (string) to null', () => {
            assert.equal(cast.cast({ foo: 'bar' }, { storedType: { type: 'string' }, type: 'object' }), null);
        });
    });

    describe('to "json"', () => {
        it('string (json) to json', () => {
            assert.equal(cast.cast('{"foo":"bar"}', { storedType: { type: 'json' }, type: 'json' }), '{"foo":"bar"}');
        });

        it('Buffer (json) to json', () => {
            assert.equal(
                cast.cast(Buffer.from('{"foo":"bar"}'), { storedType: { type: 'json' }, type: 'json' }),
                '{"foo":"bar"}'
            );
        });

        it('object (object) to json', () => {
            assert.equal(cast.cast({ foo: 'bar' }, { storedType: { type: 'object' }, type: 'json' }), '{"foo":"bar"}');
        });

        it('string (string) to json', () => {
            assert.equal(cast.cast('bar', { storedType: { type: 'string' }, type: 'json' }), '"bar"');
        });
    });

    describe('to "raw"', () => {
        it('object to raw', () => {
            assert.deepEqual(cast.cast({ foo: 'bar' }, { type: 'raw' }), { foo: 'bar' });
        });

        it('string to raw', () => {
            assert.equal(cast.cast('foo', { type: 'raw' }), 'foo');
        });

        it('number to "raw"', () => {
            assert.equal(cast.cast(42, { type: 'raw' }), 42);
        });

        it('null to raw', () => {
            assert.equal(cast.cast(null, { type: 'raw' }), null);
        });

        it('Buffer to raw', () => {
            const b = Buffer.from('foo');
            assert.equal(cast.cast(b, { type: 'raw' }), b);
        });
    });

    describe('delimiter', () => {
        it('string to int[]', () => {
            assert.deepEqual(cast.cast('1,2,3', { type: 'int', delimiter: ',' }), [1, 2, 3]);
        });

        it('string to string[]', () => {
            assert.deepEqual(cast.cast('1,2,3', { type: 'string', delimiter: ',' }), ['1', '2', '3']);
        });

        it('empty string to []', () => {
            assert.deepEqual(cast.cast('', { type: 'string', delimiter: ',' }), []);
        });
    });

    describe('multiValued', () => {
        it('string[] to string[]', () => {
            assert.deepEqual(cast.cast(['1', '2', '3'], { type: 'string', multiValued: true }), ['1', '2', '3']);
        });

        it('string[] to int[]', () => {
            assert.deepEqual(cast.cast(['1', '2', '3'], { type: 'int', multiValued: true }), [1, 2, 3]);
        });

        it('int[] to int[]', () => {
            assert.deepEqual(cast.cast([1, 2, 3], { type: 'int', multiValued: true }), [1, 2, 3]);
        });

        it('int[] to string[]', () => {
            assert.deepEqual(cast.cast([1, 2, 3], { type: 'string', multiValued: true }), ['1', '2', '3']);
        });

        it('mixed[] to string[]', () => {
            assert.deepEqual(cast.cast(['1', 2, 'foo'], { type: 'string', multiValued: true }), ['1', '2', 'foo']);
        });

        it('mixed[] with Buffer to string[]', () => {
            assert.deepEqual(cast.cast(['1', 2, Buffer.from('foo')], { type: 'string', multiValued: true }), [
                '1',
                '2',
                'foo'
            ]);
        });

        it('mixed[] to int[]', () => {
            assert.deepEqual(cast.cast(['1', 2, 'foo'], { type: 'int', multiValued: true }), [1, 2, NaN]);
        });

        it('mixed[] with Buffer to int[]', () => {
            assert.deepEqual(cast.cast([Buffer.from('1'), 2, 'foo'], { type: 'int', multiValued: true }), [1, 2, NaN]);
        });

        it('null to []', () => {
            assert.deepEqual(cast.cast(null, { multiValued: true }), []);
        });

        it('primitive to [primitive]', () => {
            assert.deepEqual(cast.cast(42, { multiValued: true, type: 'int' }), [42]);
            assert.deepEqual(cast.cast('42', { multiValued: true, type: 'int' }), [42]);
        });
    });
});

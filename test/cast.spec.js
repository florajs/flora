/* global describe, it, before, after */

'use strict';

const bunyan = require('bunyan');
const expect = require('chai').expect;

const Cast = require('../lib/cast');

const log = bunyan.createLogger({ name: 'null', streams: [] });
const api = {
    log,
    config: { timezone: 'UTC' }
};

const cast = new Cast(api);

describe('type casting', () => {
    describe('to "string"', () => {
        it('number to string', () => {
            expect(cast.cast(100, { type: 'string' })).to.equal('100');
        });

        it('string to string', () => {
            expect(cast.cast('100', { type: 'string' })).to.equal('100');
            expect(cast.cast('test data', { type: 'string' })).to.equal('test data');
        });
    });

    describe('to "int"', () => {
        it('number to int', () => {
            expect(cast.cast(100, { type: 'int' })).to.equal(100);
        });

        it('string to int', () => {
            expect(cast.cast('100', { type: 'int' })).to.equal(100);
        });

        it('invalid string to NaN', () => {
            expect(isNaN(cast.cast('foo', { type: 'int' }))).to.equal(true);
        });
    });

    describe('to "float"', () => {
        it('float to float', () => {
            expect(cast.cast(100.1, { type: 'float' })).to.equal(100.1);
        });

        it('number to float', () => {
            expect(cast.cast(100, { type: 'float' })).to.equal(100.0);
        });

        it('string to float', () => {
            expect(cast.cast('100.1', { type: 'float' })).to.equal(100.1);
        });
    });

    describe('to "boolean"', () => {
        it('boolean to boolean', () => {
            expect(cast.cast(true, { type: 'boolean' })).to.equal(true);
            expect(cast.cast(false, { type: 'boolean' })).to.equal(false);
        });

        it('number to boolean', () => {
            expect(cast.cast(1, { type: 'boolean' })).to.equal(true);
            expect(cast.cast(0, { type: 'boolean' })).to.equal(false);
        });

        it('string to boolean', () => {
            expect(cast.cast('1', { type: 'boolean' })).to.equal(true);
            expect(cast.cast('0', { type: 'boolean' })).to.equal(false);
        });
    });

    describe('to "datetime"', () => {
        describe('without timezone', () => {
            it('invalid datetime values to null', () => {
                expect(cast.cast('0000-00-00 00:00:00', { type: 'datetime' })).to.equal(null);
                expect(cast.cast('foo', { type: 'datetime' })).to.equal(null);
                expect(
                    cast.cast('03.03.2015 12:13:14', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal(null);
            });

            it('string without timezone to datetime', () => {
                expect(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'datetime'
                    })
                ).to.equal('2015-03-03T15:00:00.000Z');
            });

            it('string (datetime) without timezone to datetime', () => {
                expect(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2015-03-03T15:00:00.000Z');
            });
        });

        describe('with timezone', () => {
            it('string (datetime, timezone=Europe/Berlin) to datetime', () => {
                expect(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    })
                ).to.equal('2015-03-03T14:00:00.000Z');

                expect(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    })
                ).to.equal('2015-03-02T23:00:00.000Z');
            });

            it('string (datetime, timezone=America/New_York) to datetime', () => {
                expect(
                    cast.cast('2015-03-03 03:00:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                    })
                ).to.equal('2015-03-03T08:00:00.000Z');
            });

            it('string (datetime with offset) to datetime', () => {
                expect(
                    cast.cast('2009-06-30T21:00:00+02:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2009-06-30T19:00:00.000Z');
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
                expect(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2019-02-19T14:28:00.000Z');
            });

            it('string (datetime) without timezone to datetime (Europe/Berlin)', () => {
                api.config.timezone = 'Europe/Berlin';
                expect(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2019-02-19T14:28:00.000+01:00');
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
                expect(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2019-02-19T14:28:00.000Z');
            });

            it('string (datetime) without timezone (default=UTC) to datetime (UTC)', () => {
                api.config.timezone = 'UTC';
                api.config.defaultStoredTimezone = 'UTC';
                expect(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2019-02-19T14:28:00.000Z');
            });

            it('string (datetime) without timezone (default=Europe/Berlin) to datetime (UTC)', () => {
                api.config.timezone = 'UTC';
                api.config.defaultStoredTimezone = 'Europe/Berlin';
                expect(
                    cast.cast('2019-02-19 14:28:00', {
                        type: 'datetime',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2019-02-19T13:28:00.000Z');
            });
        });

        describe('from unixtime', () => {
            it('number (unixtime) to datetime', () => {
                expect(
                    cast.cast(1474371990, {
                        type: 'datetime',
                        storedType: { type: 'unixtime' }
                    })
                ).to.equal('2016-09-20T11:46:30.000Z');
            });

            it('string (unixtime) to datetime', () => {
                expect(
                    cast.cast('1474371990', {
                        type: 'datetime',
                        storedType: { type: 'unixtime' }
                    })
                ).to.equal('2016-09-20T11:46:30.000Z');
            });
        });
    });

    describe('to "date"', () => {
        describe('without timezone', () => {
            it('invalid date values to null', () => {
                expect(cast.cast('0000-00-00 00:00:00', { type: 'date' })).to.equal(null);
                expect(cast.cast('foo', { type: 'date' })).to.equal(null);
            });

            it('string to date', () => {
                expect(
                    cast.cast('2009-08-18', {
                        type: 'date'
                    })
                ).to.equal('2009-08-18');
            });

            it('string (date) to date', () => {
                expect(
                    cast.cast('2009-08-18', {
                        type: 'date',
                        storedType: { type: 'date' }
                    })
                ).to.equal('2009-08-18');
            });

            it('string (datetime) to date', () => {
                expect(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2015-03-03');
            });

            it('string (date) with time to date', () => {
                expect(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'date',
                        storedType: { type: 'date' }
                    })
                ).to.equal('2015-03-03');

                expect(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'date',
                        storedType: { type: 'date' }
                    })
                ).to.equal('2015-03-03');

                expect(
                    cast.cast('2015-03-03 01:00:00', {
                        type: 'date',
                        storedType: { type: 'date' }
                    })
                ).to.equal('2015-03-03');

                expect(
                    cast.cast('2015-03-03 23:00:00', {
                        type: 'date',
                        storedType: { type: 'date' }
                    })
                ).to.equal('2015-03-03');
            });

            it('string (datetime) to date', () => {
                expect(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2015-03-03');

                expect(
                    cast.cast('2015-03-03 01:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2015-03-03');

                expect(
                    cast.cast('2015-03-03 23:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime' }
                    })
                ).to.equal('2015-03-03');
            });
        });

        describe('with timezone', () => {
            it('string (date, timezone=Europe/Berlin) to date', () => {
                expect(
                    cast.cast('2009-08-18', {
                        type: 'date',
                        storedType: { type: 'date', options: { timezone: 'Europe/Berlin' } }
                    })
                ).to.equal('2009-08-18');
            });

            it('string (datetime, timezone=Europe/Berlin) to date', () => {
                expect(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    })
                ).to.equal('2015-03-03');

                expect(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    })
                ).to.equal('2015-03-03');
            });

            it('string (datetime, timezone=America/New_York) to date', () => {
                expect(
                    cast.cast('2015-03-03 03:00:00', {
                        type: 'date',
                        storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                    })
                ).to.equal('2015-03-03');
            });

            it('string (date, timezone=Europe/Berlin) with time to date', () => {
                expect(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'date',
                        storedType: { type: 'date', options: { timezone: 'Europe/Berlin' } }
                    })
                ).to.equal('2015-03-03');
            });
        });

        describe('from "unixtime"', () => {
            it('number (unixtime) to date', () => {
                expect(
                    cast.cast(1474371990, {
                        type: 'date',
                        storedType: { type: 'unixtime' }
                    })
                ).to.equal('2016-09-20');
            });
        });
    });

    describe('to "time"', () => {
        it('invalid time values to null', () => {
            expect(cast.cast('0000-00-00 00:00:00', { type: 'time' })).to.equal(null);
            expect(cast.cast('foo', { type: 'time' })).to.equal(null);
        });

        describe('from "datetime"', () => {
            it('string (datetime, timezone=Europe/Berlin) to time', () => {
                expect(
                    cast.cast('2015-03-03 15:00:00', {
                        type: 'time',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    })
                ).to.equal('14:00:00.000Z');
                expect(
                    cast.cast('2015-03-03 00:00:00', {
                        type: 'time',
                        storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                    })
                ).to.equal('23:00:00.000Z');
            });

            it('string (datetime, timezone=America/New_York) to time', () => {
                expect(
                    cast.cast('2015-03-03 03:00:00', {
                        type: 'time',
                        storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                    })
                ).to.equal('08:00:00.000Z');
            });
        });

        describe('from "unixtime"', () => {
            it('number (unixtime) to time', () => {
                expect(
                    cast.cast(1474371990, {
                        type: 'time',
                        storedType: { type: 'unixtime' }
                    })
                ).to.equal('11:46:30.000Z');
            });
        });
    });

    describe('to "unixtime"', () => {
        it('invalid date values to null', () => {
            expect(cast.cast('0000-00-00 00:00:00', { type: 'unixtime' })).to.equal(null);
            expect(cast.cast('foo', { type: 'unixtime' })).to.equal(null);
        });

        it('string to unixtime', () => {
            expect(cast.cast('2016-09-20T11:46:30.000Z', { type: 'unixtime' })).to.equal(1474371990);
        });
    });

    describe('to "object"', () => {
        it('string (json) to object', () => {
            expect(cast.cast('{"foo":"bar"}', { storedType: { type: 'json' }, type: 'object' })).to.eql({ foo: 'bar' });
        });

        it('invalid string (json) to null', () => {
            expect(cast.cast('{"foo":"bar"broken', { storedType: { type: 'json' }, type: 'object' })).to.eql(null);
        });

        it('object (object) to object', () => {
            expect(cast.cast({ foo: 'bar' }, { storedType: { type: 'object' }, type: 'object' })).to.eql({
                foo: 'bar'
            });
        });

        it('object (string) to null', () => {
            expect(cast.cast({ foo: 'bar' }, { storedType: { type: 'string' }, type: 'object' })).to.eql(null);
        });
    });

    describe('to "json"', () => {
        it('string (json) to json', () => {
            expect(cast.cast('{"foo":"bar"}', { storedType: { type: 'json' }, type: 'json' })).to.eql('{"foo":"bar"}');
        });

        it('object (object) to json', () => {
            expect(cast.cast({ foo: 'bar' }, { storedType: { type: 'object' }, type: 'json' })).to.eql('{"foo":"bar"}');
        });

        it('string (string) to json', () => {
            expect(cast.cast('bar', { storedType: { type: 'string' }, type: 'json' })).to.eql('"bar"');
        });
    });

    describe('to "raw"', () => {
        it('object to raw', () => {
            expect(cast.cast({ foo: 'bar' }, { type: 'raw' })).to.eql({ foo: 'bar' });
        });

        it('string to raw', () => {
            expect(cast.cast('foo', { type: 'raw' })).to.eql('foo');
        });

        it('number to "raw"', () => {
            expect(cast.cast(42, { type: 'raw' })).to.eql(42);
        });

        it('null to raw', () => {
            expect(cast.cast(null, { type: 'int' })).to.eql(null);
        });
    });

    describe('delimiter', () => {
        it('string to int[]', () => {
            expect(cast.cast('1,2,3', { type: 'int', delimiter: ',' })).to.eql([1, 2, 3]);
        });

        it('string to string[]', () => {
            expect(cast.cast('1,2,3', { type: 'string', delimiter: ',' })).to.eql(['1', '2', '3']);
        });

        it('empty string to []', () => {
            expect(cast.cast('', { type: 'string', delimiter: ',' })).to.eql([]);
        });
    });

    describe('multiValued', () => {
        it('string[] to string[]', () => {
            expect(cast.cast(['1', '2', '3'], { type: 'string', multiValued: true })).to.eql(['1', '2', '3']);
        });

        it('string[] to int[]', () => {
            expect(cast.cast(['1', '2', '3'], { type: 'int', multiValued: true })).to.eql([1, 2, 3]);
        });

        it('int[] to int[]', () => {
            expect(cast.cast([1, 2, 3], { type: 'int', multiValued: true })).to.eql([1, 2, 3]);
        });

        it('int[] to string[]', () => {
            expect(cast.cast([1, 2, 3], { type: 'string', multiValued: true })).to.eql(['1', '2', '3']);
        });

        it('mixed[] to string[]', () => {
            expect(cast.cast(['1', 2, 'foo'], { type: 'string', multiValued: true })).to.eql(['1', '2', 'foo']);
        });

        it('mixed[] to int[]', () => {
            expect(cast.cast(['1', 2, 'foo'], { type: 'int', multiValued: true })).to.eql([1, 2, NaN]);
        });

        it('null to []', () => {
            expect(cast.cast(null, { multiValued: true })).to.eql([]);
        });

        it('primitive to [primitive]', () => {
            expect(cast.cast(42, { multiValued: true, type: 'int' })).to.eql([42]);
            expect(cast.cast('42', { multiValued: true, type: 'int' })).to.eql([42]);
        });
    });
});

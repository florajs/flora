/* global describe, it */

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
    it('casts type "string"', () => {
        expect(cast.cast(100, { type: 'string' })).to.equal('100');
    });

    it('casts type "int"', () => {
        expect(cast.cast('100', { type: 'int' })).to.equal(100);
    });

    it('casts type "float"', () => {
        expect(cast.cast('100.1', { type: 'float' })).to.equal(100.1);
    });

    it('casts type "boolean"', () => {
        expect(cast.cast('1', { type: 'boolean' })).to.equal(true);
        expect(cast.cast('0', { type: 'boolean' })).to.equal(false);
    });

    describe('casts type "datetime" without timezone', () => {
        it('"2015-03-03 15:00:00" to datetime', () => {
            expect(
                cast.cast('2015-03-03 15:00:00', {
                    type: 'datetime'
                })
            ).to.equal('2015-03-03T15:00:00.000Z');
        });

        it('"2015-03-03 15:00:00" (datetime) to datetime', () => {
            expect(
                cast.cast('2015-03-03 15:00:00', {
                    type: 'datetime',
                    storedType: { type: 'datetime' }
                })
            ).to.equal('2015-03-03T15:00:00.000Z');
        });
    });

    describe('casts type "datetime" with timezone', () => {
        it('casts invalid datetime values to null', () => {
            expect(cast.cast('0000-00-00 00:00:00', { type: 'datetime' })).to.equal(null);
            expect(cast.cast('foo', { type: 'datetime' })).to.equal(null);
        });

        it('"2015-03-03 15:00:00" to datetime (Europe/Berlin)', () => {
            expect(
                cast.cast('2015-03-03 15:00:00', {
                    type: 'datetime',
                    storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                })
            ).to.equal('2015-03-03T14:00:00.000Z');
        });

        it('"2015-03-03 00:00:00" to datetime (Europe/Berlin)', () => {
            expect(
                cast.cast('2015-03-03 00:00:00', {
                    type: 'datetime',
                    storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                })
            ).to.equal('2015-03-02T23:00:00.000Z');
        });

        it('"2015-03-03 03:00:00" to datetime (America/New_York)', () => {
            expect(
                cast.cast('2015-03-03 03:00:00', {
                    type: 'datetime',
                    storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                })
            ).to.equal('2015-03-03T08:00:00.000Z');
        });

        it('"2009-06-30T21:00:00+02:00" to datetime', () => {
            expect(
                cast.cast('2009-06-30T21:00:00+02:00', {
                    type: 'datetime',
                    storedType: { type: 'datetime' }
                })
            ).to.equal('2009-06-30T19:00:00.000Z');
        });

        it('ignores invalid "datetime" values', () => {
            expect(
                cast.cast('03.03.2015 12:13:14', {
                    type: 'datetime',
                    storedType: { type: 'datetime' }
                })
            ).to.equal(null);
        });
    });

    describe('casts type "date" types from "unixtime"', () => {
        it('casts unixtime integer to datetime', () => {
            expect(
                cast.cast(1474371990, {
                    type: 'datetime',
                    storedType: { type: 'unixtime' }
                })
            ).to.equal('2016-09-20T11:46:30.000Z');
        });
        it('casts unixtime string to datetime', () => {
            expect(
                cast.cast('1474371990', {
                    type: 'datetime',
                    storedType: { type: 'unixtime' }
                })
            ).to.equal('2016-09-20T11:46:30.000Z');
        });

        it('casts unixtime integer to date', () => {
            expect(
                cast.cast(1474371990, {
                    type: 'date',
                    storedType: { type: 'unixtime' }
                })
            ).to.equal('2016-09-20');
        });

        it('casts unixtime integer to time', () => {
            expect(
                cast.cast(1474371990, {
                    type: 'time',
                    storedType: { type: 'unixtime' }
                })
            ).to.equal('11:46:30.000Z');
        });
    });

    describe('casts type "date" without timezone', () => {
        it('passes through when parsing from date to date', () => {
            expect(
                cast.cast('2009-08-18', {
                    type: 'date',
                    storedType: { type: 'date' }
                })
            ).to.equal('2009-08-18');
        });

        it('passes through when parsing from string to date (no storedType)', () => {
            expect(
                cast.cast('2009-08-18', {
                    type: 'date'
                })
            ).to.equal('2009-08-18');
        });

        it('"2015-03-03 (datetime) 15:00:00" to date (no timezone)', () => {
            expect(
                cast.cast('2015-03-03 15:00:00', {
                    type: 'date',
                    storedType: { type: 'datetime' }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 (date) 15:00:00" to date (no timezone)', () => {
            expect(
                cast.cast('2015-03-03 15:00:00', {
                    type: 'date',
                    storedType: { type: 'date' }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 00:00:00" (datetime) to date (no timezone)', () => {
            expect(
                cast.cast('2015-03-03 00:00:00', {
                    type: 'date',
                    storedType: { type: 'datetime' }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 00:00:00" (date) to date (no timezone)', () => {
            expect(
                cast.cast('2015-03-03 00:00:00', {
                    type: 'date',
                    storedType: { type: 'date' }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 01:00:00" (datetime)  to date (no timezone)', () => {
            expect(
                cast.cast('2015-03-03 01:00:00', {
                    type: 'date',
                    storedType: { type: 'datetime' }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 01:00:00" (date)  to date (no timezone)', () => {
            expect(
                cast.cast('2015-03-03 01:00:00', {
                    type: 'date',
                    storedType: { type: 'date' }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 23:00:00" (datetime) to date (no timezone)', () => {
            expect(
                cast.cast('2015-03-03 23:00:00', {
                    type: 'date',
                    storedType: { type: 'datetime' }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 23:00:00" (date) to date (no timezone)', () => {
            expect(
                cast.cast('2015-03-03 23:00:00', {
                    type: 'date',
                    storedType: { type: 'date' }
                })
            ).to.equal('2015-03-03');
        });
    });

    describe('casts type "date" with timezone', () => {
        it('casts invalid datetime values to null', () => {
            expect(cast.cast('0000-00-00 00:00:00', { type: 'date' })).to.equal(null);
            expect(cast.cast('foo', { type: 'date' })).to.equal(null);
        });

        it('passes through when parsing from date to date', () => {
            expect(
                cast.cast('2009-08-18', {
                    type: 'date',
                    storedType: { type: 'date', options: { timezone: 'Europe/Berlin' } }
                })
            ).to.equal('2009-08-18');
        });

        it('"2015-03-03 15:00:00" to date (Europe/Berlin)', () => {
            expect(
                cast.cast('2015-03-03 15:00:00', {
                    type: 'date',
                    storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 15:00:00" (date) to date (Europe/Berlin)', () => {
            expect(
                cast.cast('2015-03-03 15:00:00', {
                    type: 'date',
                    storedType: { type: 'date', options: { timezone: 'Europe/Berlin' } }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 00:00:00" to date (Europe/Berlin)', () => {
            expect(
                cast.cast('2015-03-03 00:00:00', {
                    type: 'date',
                    storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                })
            ).to.equal('2015-03-03');
        });

        it('"2015-03-03 03:00:00" to date (America/New_York)', () => {
            expect(
                cast.cast('2015-03-03 03:00:00', {
                    type: 'date',
                    storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                })
            ).to.equal('2015-03-03');
        });
    });

    describe('casts type "time" with timezone', () => {
        it('casts invalid time values to null', () => {
            expect(cast.cast('0000-00-00 00:00:00', { type: 'time' })).to.equal(null);
            expect(cast.cast('foo', { type: 'time' })).to.equal(null);
        });

        it('"2015-03-03 15:00:00" to time (Europe/Berlin)', () => {
            expect(
                cast.cast('2015-03-03 15:00:00', {
                    type: 'time',
                    storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                })
            ).to.equal('14:00:00.000Z');
        });

        it('"2015-03-03 00:00:00" to time (Europe/Berlin)', () => {
            expect(
                cast.cast('2015-03-03 00:00:00', {
                    type: 'time',
                    storedType: { type: 'datetime', options: { timezone: 'Europe/Berlin' } }
                })
            ).to.equal('23:00:00.000Z');
        });

        it('"2015-03-03 03:00:00" to time (America/New_York)', () => {
            expect(
                cast.cast('2015-03-03 03:00:00', {
                    type: 'time',
                    storedType: { type: 'datetime', options: { timezone: 'America/New_York' } }
                })
            ).to.equal('08:00:00.000Z');
        });
    });

    describe('casts type "unixtime"', () => {
        it('casts invalid date values to null', () => {
            expect(cast.cast('0000-00-00 00:00:00', { type: 'unixtime' })).to.equal(null);
            expect(cast.cast('foo', { type: 'unixtime' })).to.equal(null);
        });

        it('"2016-09-20T11:46:30.000Z" to unixtime', () => {
            expect(cast.cast('2016-09-20T11:46:30.000Z', { type: 'unixtime' })).to.equal(1474371990);
        });
    });

    describe('casts to type "object"', () => {
        it('casts objects from storedType="json"', () => {
            expect(cast.cast('{"foo":"bar"}', { storedType: { type: 'json' }, type: 'object' })).to.eql({ foo: 'bar' });
        });

        it('fails silently when JSON is invalid', () => {
            expect(cast.cast('{"foo":"bar"broken', { storedType: { type: 'json' }, type: 'object' })).to.eql(null);
        });

        it('passes through objects from storedType="object"', () => {
            expect(cast.cast({ foo: 'bar' }, { storedType: { type: 'object' }, type: 'object' })).to.eql({
                foo: 'bar'
            });
        });

        it('returns null when storedType is something else', () => {
            expect(cast.cast({ foo: 'bar' }, { storedType: { type: 'string' }, type: 'object' })).to.eql(null);
        });
    });

    describe('casts to type "json"', () => {
        it('passes through values from storedType="json"', () => {
            expect(cast.cast('{"foo":"bar"}', { storedType: { type: 'json' }, type: 'json' })).to.eql('{"foo":"bar"}');
        });

        it('casts objects from storedType="object"', () => {
            expect(cast.cast({ foo: 'bar' }, { storedType: { type: 'object' }, type: 'json' })).to.eql('{"foo":"bar"}');
        });

        it('casts anything to JSON', () => {
            expect(cast.cast('bar', { storedType: { type: 'string' }, type: 'json' })).to.eql('"bar"');
        });
    });

    it('passes through objects type "raw" (preserves objects)', () => {
        expect(cast.cast({ foo: 'bar' }, { type: 'raw' })).to.eql({ foo: 'bar' });
    });

    it('passes through objects type "raw" (preserves strings)', () => {
        expect(cast.cast('foo', { type: 'raw' })).to.eql('foo');
    });

    it('passes through objects type "raw" (preserves integers)', () => {
        expect(cast.cast(42, { type: 'raw' })).to.eql(42);
    });

    it('always passes through null', () => {
        expect(cast.cast(null, { type: 'int' })).to.eql(null);
    });

    describe('delimiter', () => {
        it('splits int by delimiter', () => {
            expect(cast.cast('1,2,3', { type: 'int', delimiter: ',' })).to.eql([1, 2, 3]);
        });

        it('splits strings by delimiter', () => {
            expect(cast.cast('1,2,3', { type: 'string', delimiter: ',' })).to.eql(['1', '2', '3']);
        });

        it('returns empty array for empty input string', () => {
            expect(cast.cast('', { type: 'string', delimiter: ',' })).to.eql([]);
        });
    });

    describe('multiValued', () => {
        it('handles multiValued values one by one', () => {
            expect(cast.cast(['1', '2', '3'], { type: 'int', multiValued: true })).to.eql([1, 2, 3]);
            expect(cast.cast([1, 2, 3], { type: 'string', multiValued: true })).to.eql(['1', '2', '3']);
        });

        it('handles null as empty array', () => {
            expect(cast.cast(null, { multiValued: true })).to.eql([]);
        });

        it('casts scalar value to single-valued array', () => {
            expect(cast.cast(42, { multiValued: true, type: 'int' })).to.eql([42]);
            expect(cast.cast('42', { multiValued: true, type: 'int' })).to.eql([42]);
        });
    });
});

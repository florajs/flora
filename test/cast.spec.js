'use strict';

var expect = require('chai').expect;
var cast = require('../lib/cast');

describe('type casting', function () {
    it('casts type "string"', function () {
        expect(cast(100, {type: 'string'})).to.equal('100');
    });

    it('casts type "int"', function () {
        expect(cast('100', {type: 'int'})).to.equal(100);
    });

    it('casts type "float"', function () {
        expect(cast('100.1', {type: 'float'})).to.equal(100.1);
    });

    it('casts type "boolean"', function () {
        expect(cast('1', {type: 'boolean'})).to.equal(true);
        expect(cast('0', {type: 'boolean'})).to.equal(false);
    });

    describe('casts type "datetime" with timezone', function () {
        it('casts invalid datetime values to null', function () {
            expect(cast('0000-00-00 00:00:00', {type: 'datetime'})).to.equal(null);
            expect(cast('foo', {type: 'datetime'})).to.equal(null);
        });

        it('"2015-03-03 15:00:00" to datetime (Europe/Berlin)', function () {
            expect(cast('2015-03-03 15:00:00', {
                type: 'datetime',
                storedType: {type: "datetime", options: {tz: "Europe/Berlin"}}
            })).to.equal('2015-03-03T14:00:00.000Z');
        });

        it('"2015-03-03 00:00:00" to datetime (Europe/Berlin)', function () {
            expect(cast('2015-03-03 00:00:00', {
                type: 'datetime',
                storedType: {type: "datetime", options: {tz: "Europe/Berlin"}}
            })).to.equal('2015-03-02T23:00:00.000Z');
        });

        it('"2015-03-03 03:00:00" to datetime (America/New_York)', function () {
            expect(cast('2015-03-03 03:00:00', {
                type: 'datetime',
                storedType: {type: "datetime", options: {tz: "America/New_York"}}
            })).to.equal('2015-03-03T08:00:00.000Z');
        });
    });

    describe('casts type "date" with timezone', function () {
        it('casts invalid datetime values to null', function () {
            expect(cast('0000-00-00 00:00:00', {type: 'date'})).to.equal(null);
            expect(cast('foo', {type: 'date'})).to.equal(null);
        });

        it('"2015-03-03 15:00:00" to date (Europe/Berlin)', function () {
            expect(cast('2015-03-03 15:00:00', {
                type: 'date',
                storedType: {type: "datetime", options: {tz: "Europe/Berlin"}}
            })).to.equal('2015-03-03');
        });

        it('"2015-03-03 00:00:00" to date (Europe/Berlin)', function () {
            expect(cast('2015-03-03 00:00:00', {
                type: 'date',
                storedType: {type: "datetime", options: {tz: "Europe/Berlin"}}
            })).to.equal('2015-03-02');
        });

        it('"2015-03-03 03:00:00" to date (America/New_York)', function () {
            expect(cast('2015-03-03 03:00:00', {
                type: 'date',
                storedType: {type: "datetime", options: {tz: "America/New_York"}}
            })).to.equal('2015-03-03');
        });
    });

    describe('casts type "time" with timezone', function () {
        it('casts invalid time values to null', function () {
            expect(cast('0000-00-00 00:00:00', {type: 'time'})).to.equal(null);
            expect(cast('foo', {type: 'time'})).to.equal(null);
        });

        it('"2015-03-03 15:00:00" to time (Europe/Berlin)', function () {
            expect(cast('2015-03-03 15:00:00', {
                type: 'time',
                storedType: {type: "datetime", options: {tz: "Europe/Berlin"}}
            })).to.equal('14:00:00.000Z');
        });

        it('"2015-03-03 00:00:00" to time (Europe/Berlin)', function () {
            expect(cast('2015-03-03 00:00:00', {
                type: 'time',
                storedType: {type: "datetime", options: {tz: "Europe/Berlin"}}
            })).to.equal('23:00:00.000Z');
        });

        it('"2015-03-03 03:00:00" to time (America/New_York)', function () {
            expect(cast('2015-03-03 03:00:00', {
                type: 'time',
                storedType: {type: "datetime", options: {tz: "America/New_York"}}
            })).to.equal('08:00:00.000Z');
        });
    });

    it('passes through objects type "raw" (preserves objects)', function () {
        expect(cast({foo: 'bar'}, {type: 'raw'})).to.eql({foo: 'bar'});
    });

    it('passes through objects type "raw" (preserves strings)', function () {
        expect(cast('foo', {type: 'raw'})).to.eql('foo');
    });

    it('passes through objects type "raw" (preserves integers)', function () {
        expect(cast(42, {type: 'raw'})).to.eql(42);
    });

    it('always passes through null', function () {
        expect(cast(null, {type: 'int'})).to.eql(null);
    });

    describe('delimiter', function () {
        it('splits int by delimiter', function () {
            expect(cast('1,2,3', {type: 'int', delimiter: ','})).to.eql([1, 2, 3]);
        });

        it('splits strings by delimiter', function () {
            expect(cast('1,2,3', {type: 'string', delimiter: ','})).to.eql(['1', '2', '3']);
        });
    });

    describe('multiValued', function () {
        it('handles multiValued values one by one', function () {
            expect(cast(['1', '2', '3'], {type: 'int', multiValued: true})).to.eql([1, 2, 3]);
            expect(cast([1, 2, 3], {type: 'string', multiValued: true})).to.eql(['1', '2', '3']);
        });

        it('handles null as empty array', function () {
            expect(cast(null, {multiValued: true})).to.eql([]);
        });

        it('casts scalar value to single-valued array', function () {
            expect(cast(42, {multiValued: true, type: 'int'})).to.eql([42]);
            expect(cast('42', {multiValued: true, type: 'int'})).to.eql([42]);
        });
    });
});

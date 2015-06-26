'use strict';

var expect = require('chai').expect;
var cast = require('../lib/cast');

describe('type casting', function () {
    it('casts type "string"', function () {
        expect(cast(100, 'string')).to.equal('100');
    });

    it('casts type "int"', function () {
        expect(cast('100', 'int')).to.equal(100);
    });

    it('casts type "float"', function () {
        expect(cast('100.1', 'float')).to.equal(100.1);
    });

    it('casts type "boolean"', function () {
        expect(cast('1', 'boolean')).to.equal(true);
        expect(cast('0', 'boolean')).to.equal(false);
    });

    it('casts type "date"', function () {
        // TODO: implement type "date" correctly
        expect(cast('2015-03-03 15:00:00', 'date')).to.equal('2015-03-03');
    });

    it('casts invalid date values to null', function () {
        expect(cast('0000-00-00 00:00:00', 'date')).to.equal(null);
        expect(cast('0000-00-00 00:00:00', 'datetime')).to.equal(null);
        expect(cast('0000-00-00 00:00:00', 'time')).to.equal(null);

        expect(cast('foo', 'date')).to.equal(null);
        expect(cast('foo', 'datetime')).to.equal(null);
        expect(cast('foo', 'time')).to.equal(null);
    });

    it('casts type "datetime"', function () {
        // TODO: implement type "datetime" correctly
        expect(cast('2015-03-03 15:00:00', 'datetime')).to.equal('2015-03-03T14:00:00.000Z');
    });

    it('casts type "time"', function () {
        // TODO: implement type "time" correctly
        expect(cast('2015-03-03 15:00:00', 'time')).to.equal('14:00:00.000Z');
    });

    it('passes through objects type "raw" (preserves objects)', function () {
        expect(cast({foo: 'bar'}, 'raw')).to.eql({foo: 'bar'});
    });

    it('passes through objects type "raw" (preserves strings)', function () {
        expect(cast('foo', 'raw')).to.eql('foo');
    });

    it('passes through objects type "raw" (preserves integers)', function () {
        expect(cast(42, 'raw')).to.eql(42);
    });

    it('always passes through null', function () {
        expect(cast(null, 'int')).to.eql(null);
    });
});

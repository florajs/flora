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

    it('casts type "date"', function () {
        // TODO: implement type "date" correctly
        expect(cast('2015-03-03 15:00:00', {type: 'date'})).to.equal('2015-03-03');
    });

    it('casts invalid date values to null', function () {
        expect(cast('0000-00-00 00:00:00', {type: 'date'})).to.equal(null);
        expect(cast('0000-00-00 00:00:00', {type: 'datetime'})).to.equal(null);
        expect(cast('0000-00-00 00:00:00', {type: 'time'})).to.equal(null);

        expect(cast('foo', {type: 'date'})).to.equal(null);
        expect(cast('foo', {type: 'datetime'})).to.equal(null);
        expect(cast('foo', {type: 'time'})).to.equal(null);
    });

    it('casts type "datetime"', function () {
        // TODO: implement type "datetime" correctly
        expect(cast('2015-03-03 15:00:00', {type: 'datetime'})).to.equal('2015-03-03T14:00:00.000Z');
    });

    it('casts type "time"', function () {
        // TODO: implement type "time" correctly
        expect(cast('2015-03-03 15:00:00', {type: 'time'})).to.equal('14:00:00.000Z');
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
});

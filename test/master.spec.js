'use strict';

var expect = require('chai').expect;
var bunyan = require('bunyan');
var path = require('path');
var Master = require('../lib/master');

describe('Master', function () {
    it('should be a function', function () {
        expect(Master).to.be.a('function');
    });

    it('should be instantiable', function () {
        expect(new Master()).to.be.an('object');
    });
});

'use strict';

var resourceProcessor = require('../lib/resource-processor'),
    expect = require('chai').expect;

describe('resource-processor', function () {

    it('should be an object', function () {
        expect(resourceProcessor).to.be.a('function');
    });

});

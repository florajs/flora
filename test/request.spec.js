'use strict';

var expect = require('chai').expect;
var Request = require('../lib/request');

describe('Request', function () {
    it('should be instantiable', function () {
        expect(new Request()).to.be.an('object');
    });

    it('should accept an options object', function () {
        var request = new Request({
            resource: '_RESOURCE_',
            action: '_ACTION_',
            format: '_FORMAT_'
        });
        expect(request.resource).to.equal('_RESOURCE_');
        expect(request.action).to.equal('_ACTION_');
        expect(request.format).to.equal('_FORMAT_');
    });

    it('should set the default action "retrieve"', function () {
        expect((new Request()).action).to.equal('retrieve');
    });

    it('should set the default format "json"', function () {
        expect((new Request()).format).to.equal('json');
    });

    it('should instantiate a timer', function () {
        expect((new Request()).timer).to.be.an('object');
    });

    it('should store httpRequest', function () {
        expect((new Request({
            httpRequest: 'foo'
        })).httpRequest).to.equal('foo');
    });
});

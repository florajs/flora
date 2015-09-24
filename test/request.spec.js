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

    it('should store _status', function () {
        expect((new Request({
            _status: 'foo'
        }))._status).to.equal('foo');
    });

    it('should instantiate a _profiler', function () {
        expect((new Request())._profiler).to.be.an('object');
    });

    it('should store _httpRequest', function () {
        expect((new Request({
            _httpRequest: 'foo'
        }))._httpRequest).to.equal('foo');
    });

    it('should store custom properties', function () {
        expect(new Request({ customParam: 1337 }))
            .to.have.property('customParam')
            .and.to.equal(1337);
    });
});

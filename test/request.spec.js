'use strict';

const { expect } = require('chai');

const Request = require('../lib/request');

describe('Request', () => {
    const reqOpts = { resource: 'foo' };

    it('should be instantiable', () => {
        expect(new Request(reqOpts)).to.be.an('object');
    });

    it('should accept an options object', () => {
        const request = new Request({
            resource: '_RESOURCE_',
            action: '_ACTION_',
            format: '_FORMAT_'
        });
        expect(request.resource).to.equal('_RESOURCE_');
        expect(request.action).to.equal('_ACTION_');
        expect(request.format).to.equal('_FORMAT_');
    });

    it('should set the default action "retrieve"', () => {
        expect((new Request(reqOpts)).action).to.equal('retrieve');
    });

    it('should set the default format "json"', () => {
        expect((new Request(reqOpts)).format).to.equal('json');
    });

    it('should store _status', () => {
        expect((new Request({
            _status: 'foo'
        }))._status).to.equal('foo');
    });

    it('should instantiate a _profiler', () => {
        expect((new Request(reqOpts))._profiler).to.be.an('object');
    });

    it('should store _httpRequest', () => {
        expect((new Request({
            _httpRequest: 'foo'
        }))._httpRequest).to.equal('foo');
    });

    it('should store custom properties', () => {
        expect(new Request({ resource: 'foo', customParam: 1337 }))
            .to.have.property('customParam')
            .and.to.equal(1337);
    });
});

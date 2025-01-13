'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Request = require('../lib/request');

describe('Request', () => {
    const reqOpts = { resource: 'foo' };

    it('should be instantiable', () => {
        assert.equal(typeof new Request(reqOpts), 'object');
    });

    it('should accept an options object', () => {
        const request = new Request({
            resource: '_RESOURCE_',
            action: '_ACTION_',
            format: '_FORMAT_'
        });
        assert.equal(request.resource, '_RESOURCE_');
        assert.equal(request.action, '_ACTION_');
        assert.equal(request.format, '_FORMAT_');
    });

    it('should set the default action "retrieve"', () => {
        assert.equal(new Request(reqOpts).action, 'retrieve');
    });

    it('should set the default format "json"', () => {
        assert.equal(new Request(reqOpts).format, 'json');
    });

    it('should store _status', () => {
        assert.equal(
            new Request({
                _status: 'foo'
            })._status,
            'foo'
        );
    });

    it('should instantiate a _profiler', () => {
        assert.equal(typeof new Request(reqOpts)._profiler, 'object');
    });

    it('should store _httpRequest', () => {
        assert.equal(
            new Request({
                _httpRequest: 'foo'
            })._httpRequest,
            'foo'
        );
    });

    it('should store custom properties', () => {
        const request = new Request({ resource: 'foo', customParam: 1337 });
        assert.ok(Object.hasOwn(request, 'customParam'));
        assert.equal(request.customParam, 1337);
    });
});

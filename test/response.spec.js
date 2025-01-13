'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Response = require('../lib/response');
const Request = require('../lib/request');

describe('Response', () => {
    const reqOpts = { resource: 'test' };

    it('should be instantiable', () => {
        assert.equal(typeof new Response(new Request(reqOpts)), 'object');
    });

    it('should pass through a Request parameter', () => {
        const request = new Request(reqOpts);
        const response = new Response(request);
        assert.deepEqual(response.request, request);
    });

    it('should have basic properties', () => {
        const response = new Response(new Request(reqOpts));
        assert.equal(typeof response.meta, 'object');
        assert.equal(typeof response.meta.headers, 'object');
    });

    it('should disallow setting meta.headers property directly', () => {
        const response = new Response(new Request(reqOpts));

        assert.throws(
            () => (response.meta.headers = { 'Content-Type': 'application/pdf' }),
            (err) => err.name === 'TypeError' && err.message.startsWith(`Cannot assign to read only property 'headers'`)
        );
    });

    it('should not expose headers in response.meta', () => {
        const response = new Response(new Request(reqOpts));
        const propertyDescriptor = Object.getOwnPropertyDescriptor(response.meta, 'headers');
        assert.ok(propertyDescriptor);
        assert.equal(propertyDescriptor.enumerable, false);
    });

    it('should have default status code', () => {
        const response = new Response(new Request(reqOpts));
        assert.ok(Object.hasOwn(response.meta, 'statusCode'));
        assert.equal(response.meta.statusCode, 200);
    });

    it('should allow to set headers', () => {
        const response = new Response(new Request(reqOpts));
        response.header('X-Foo', 'bar');
        assert.ok(Object.hasOwn(response.meta.headers, 'x-foo'));
        assert.equal(response.meta.headers['x-foo'], 'bar');
    });

    it('should allow to set type', () => {
        const response = new Response(new Request(reqOpts));
        response.type('image/png');
        assert.ok(Object.hasOwn(response.meta.headers, 'content-type'));
        assert.equal(response.meta.headers['content-type'], 'image/png');
    });

    it('should allow to set status code', () => {
        const response = new Response(new Request(reqOpts));
        response.status(418);
        assert.ok(Object.hasOwn(response.meta, 'statusCode'));
        assert.equal(response.meta.statusCode, 418);
    });
});

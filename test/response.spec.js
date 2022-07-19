'use strict';

const { expect } = require('chai');

const Response = require('../lib/response');
const Request = require('../lib/request');

describe('Response', () => {
    const reqOpts = { resource: 'test' };

    it('should be instantiable', () => {
        expect(new Response(new Request(reqOpts))).to.be.an('object');
    });

    it('should pass through a Request parameter', () => {
        const request = new Request(reqOpts);
        const response = new Response(request);
        expect(response.request).to.eql(request);
    });

    it('should have basic properties', () => {
        const response = new Response(new Request(reqOpts));
        expect(response.meta).to.be.an('object');
        expect(response.meta.headers).to.be.an('object');
    });

    it('should disallow setting meta.headers property directly', () => {
        const response = new Response(new Request(reqOpts));

        expect(() => {
            response.meta.headers = { 'Content-Type': 'application/pdf' };
        }).to.throw(TypeError, `Cannot assign to read only property 'headers'`);
    });

    it('should not expose headers in response.meta', () => {
        const response = new Response(new Request(reqOpts));
        expect(response.meta).to.have.ownPropertyDescriptor('headers').that.has.property('enumerable', false);
    });

    it('should have default status code', () => {
        const response = new Response(new Request(reqOpts));
        expect(response.meta.statusCode).to.eql(200);
    });

    it('should allow to set headers', () => {
        const response = new Response(new Request(reqOpts));
        response.header('X-Foo', 'bar');
        expect(response.meta.headers).to.have.property('x-foo', 'bar');
    });

    it('should allow to set type', () => {
        const response = new Response(new Request(reqOpts));
        response.type('image/png');
        expect(response.meta.headers).to.have.property('content-type', 'image/png');
    });

    it('should allow to set status code', () => {
        const response = new Response(new Request(reqOpts));
        response.status(418);
        expect(response.meta.statusCode).to.equal(418);
    });
});

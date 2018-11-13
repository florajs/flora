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

    it('should have writeable meta.headers property', () => {
        const response = new Response(new Request(reqOpts));

        expect(() => {
            response.meta.headers = {'Content-Type': 'application/pdf'};
        }).to.not.throw(Error);
        expect(response.meta.headers).to.have.property('Content-Type');
    });

    it('should not expose headers in response.meta', () => {
        const response = new Response(new Request(reqOpts));
        expect(response.meta.propertyIsEnumerable('headers')).to.be.false;
    });

    it('should have default status code', () => {
        const response = new Response(new Request(reqOpts));
        expect(response.meta.statusCode).to.eql(200);
    });

    describe('send', () => {
        it('should pass through the payload', () => {
            const response = new Response(new Request(reqOpts));
            response.send('foo');
            expect(response.data).to.eql('foo');
        });

        it('should pass through errors', () => {
            const response = new Response(new Request(reqOpts));
            response.send(new Error('bar'));
            expect(response.data).to.be.an.instanceof(Error);
        });
    });
});

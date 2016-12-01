'use strict';

const { expect } = require('chai');

const parseRequest = require('../lib/url-parser');
const { Request } = require('../');

describe('HTTP request parsing', () => {
    let httpRequest;
    let request;

    beforeEach(() => {
        httpRequest = {
            flora: { status: {} }
        };
    });

    it('should return flora request', () => {
        httpRequest.url = 'http://api.example.com/user/';
        expect(parseRequest(httpRequest)).to.be.instanceOf(Request);
    });

    it('should return null if parsing fails', () => {
        httpRequest.url = 'http://api.example.com/';
        expect(parseRequest(httpRequest)).to.be.null;
    });

    describe('flat resources', () => {
        it('should parse resource', () => {
            httpRequest.url = 'http://api.example.com/user/';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('resource', 'user');
        });

        it('should parse id', () => {
            httpRequest.url = 'http://api.example.com/user/1337';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('id', '1337');
        });

        it('should parse format', () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('format', 'jpg');
        });
    });

    describe('nested resources', () => {
        it('should parse resource', () => {
            httpRequest.url = 'http://api.example.com/user/image/';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('resource', 'user/image');
        });

        it('should parse id', () => {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('id', '1337');
        });

        it('should parse format', () => {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('format', 'image');
        });

        it('should parse deeply nested resources', () => {
            httpRequest.url = 'http://api.example.com/store/admin/customer/address/1337';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('resource', 'store/admin/customer/address');
        });
    });

    describe('query parameters', () => {
        it('should be copied', () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?width=60&rotate=90';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('width', '60');
            expect(request).to.have.property('rotate', '90');
        });

        it('should not overwrite existing request properties', () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?format=tiff&resource=abc';
            request = parseRequest(httpRequest);
            expect(request.resource).to.equal('user');
            expect(request.format).to.equal('jpg');
        });
    });
});

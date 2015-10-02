'use strict';

var parseRequest = require('../lib/url-parser');
var Request = require('../').Request;

var expect = require('chai').expect;

describe('HTTP request parsing', function () {
    var httpRequest,
        request;

    beforeEach(function () {
        httpRequest = {
            flora: {status: {}}
        };
    });

    it('should return flora request', function () {
        httpRequest.url = 'http://api.example.com/user/';
        expect(parseRequest(httpRequest)).to.be.instanceOf(Request);
    });

    it('should return null if parsing fails', function () {
        httpRequest.url = 'http://api.example.com/';
        expect(parseRequest(httpRequest)).to.be.null;
    });

    describe('flat resources', function () {
        it('should parse resource', function () {
            httpRequest.url = 'http://api.example.com/user/';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('resource', 'user');
        });

        it('should parse id', function () {
            httpRequest.url = 'http://api.example.com/user/1337';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('id', '1337');
        });

        it('should parse format', function () {
            httpRequest.url = 'http://api.example.com/user/1337.jpg';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('format', 'jpg');
        });
    });

    describe('nested resources', function () {
        it('should parse resource', function () {
            httpRequest.url = 'http://api.example.com/user/image/';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('resource', 'user/image');
        });

        it('should parse id', function () {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('id', '1337');
        });

        it('should parse format', function () {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('format', 'image');
        });

        it('should parse deeply nested resources', function () {
            httpRequest.url = 'http://api.example.com/store/admin/customer/address/1337';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('resource', 'store/admin/customer/address');
        });
    });

    describe('query parameters', function () {
        it('should be copied', function () {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?width=60&rotate=90';
            request = parseRequest(httpRequest);
            expect(request).to.have.property('width', '60');
            expect(request).to.have.property('rotate', '90');
        });

        it('should not overwrite existing request properties', function () {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?format=tiff&resource=abc';
            request = parseRequest(httpRequest);
            expect(request.resource).to.equal('user');
            expect(request.format).to.equal('jpg');
        });
    });
});

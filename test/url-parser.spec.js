'use strict';

const { expect } = require('chai');

const parseRequest = require('../lib/url-parser');
const { Request } = require('../');

describe('HTTP request parsing', () => {
    let httpRequest;
    let request;
    let promise;

    beforeEach(() => {
        httpRequest = {
            flora: { status: {} },
            headers: { 'content-type': 'application/json' },
            setEncoding() {},
            on(e, fn) { e==='end' && setTimeout(fn, 0); }
        };
    });

    it('should return promise', () => {
        httpRequest.url = 'http://api.example.com/user/';
        expect(parseRequest(httpRequest)).to.be.instanceOf(Promise);
    });

    it('should resolve with null if parsing fails', done => {
        httpRequest.url = 'http://api.example.com/';
        parseRequest(httpRequest).then(request => {
            expect(request).to.be.null;
            done();
        }).catch(done);
    });

    describe('flat resources', () => {
        it('should parse resource', done => {
            httpRequest.url = 'http://api.example.com/user/';
            promise = parseRequest(httpRequest);
            
            promise.then(request => {
                expect(request).to.have.property('resource', 'user');
                done();
            }).catch(done);
        });

        it('should parse id', done => {
            httpRequest.url = 'http://api.example.com/user/1337';
            promise = parseRequest(httpRequest);
    
            promise.then(request => {
                expect(request).to.have.property('id', '1337');
                done();
            }).catch(done);
        });

        it('should parse format', done => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg';
            promise = parseRequest(httpRequest);
    
            promise.then(request => {
                expect(request).to.have.property('format', 'jpg');
                done();
            }).catch(done);
        });
    });

    describe('nested resources', () => {
        it('should parse resource', done => {
            httpRequest.url = 'http://api.example.com/user/image/';
            promise = parseRequest(httpRequest);
    
            promise.then(request => {
                expect(request).to.have.property('resource', 'user/image');
                done();
            }).catch(done);
        });

        it('should parse id', done => {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';
            promise = parseRequest(httpRequest);
    
            promise.then(request => {
                expect(request).to.have.property('id', '1337');
                done();
            }).catch(done);
        });

        it('should parse format', done => {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';
            promise = parseRequest(httpRequest);
    
            promise.then(request => {
                expect(request).to.have.property('format', 'image');
                done();
            }).catch(done);
        });

        it('should parse deeply nested resources', done => {
            httpRequest.url = 'http://api.example.com/store/admin/customer/address/1337';
            promise = parseRequest(httpRequest);
    
            promise.then(request => {
                expect(request).to.have.property('resource', 'store/admin/customer/address');
                done();
            }).catch(done);
        });
    });

    describe('query parameters', () => {
        it('should be copied', done => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?width=60&rotate=90';
            promise = parseRequest(httpRequest);
    
            promise.then(request => {
                expect(request).to.have.property('width', '60');
                expect(request).to.have.property('rotate', '90');
                done();
            }).catch(done);
        });

        it('should not overwrite existing request properties', done => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?format=tiff&resource=abc';
            promise = parseRequest(httpRequest);
    
            promise.then(request => {
                expect(request.resource).to.equal('user');
                expect(request.format).to.equal('jpg');
                done();
            }).catch(done);
        });
    });
});

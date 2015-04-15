'use strict';

var expect = require('chai').expect;
var Response = require('../lib/response');
var Request = require('../lib/request');

describe('Response', function () {
    it('should be instantiable', function () {
        expect(new Response()).to.be.an('object');
    });

    it('should pass through a Request parameter', function () {
        var request = new Request();
        var response = new Response(request);
        expect(response.request).to.eql(request);
    });

    it('should have basic properties', function () {
        var request = new Request();
        var response = new Response(request);
        expect(response.meta).to.be.an('object');
        expect(response.data).to.eql(null);
    });

    describe('send', function () {
        it('should call the callback', function (done) {
            var request = new Request();
            var response = new Response(request, function (err) {
                expect(err).to.eql(null);
                done();
            });
            response.send();
        });

        it('should pass through the payload', function (done) {
            var request = new Request();
            var response = new Response(request, function (err, res) {
                expect(res).to.eql(response);
                expect(res.data).to.eql('foo');
                done();
            });
            response.send('foo');
        });

        xit('should pass through generic Errors', function (done) {
            var request = new Request();
            var response = new Response(request, function (err, res) {
                expect(res.meta.err).to.be.an('object');
                expect(res.meta.err.message).to.eql('bar');
                expect(res.statusCode).to.equal(500);
                done();
            });
            response.send(new Error('bar'));
        });

        xit('should pass through httpStatusCode', function (done) {
            var request = new Request();
            var response = new Response(request, function (err, res) {
                expect(res.meta.err).to.be.an('object');
                expect(res.meta.err.message).to.eql('teapot');
                expect(res.statusCode).to.equal(418);
                done();
            });
            var e = new Error('teapot');
            e.httpStatusCode = 418;
            response.send(e);
        });

        it('cannot be called twice', function (done) {
            var count = 0;
            var request = new Request();
            var response = new Response(request, function (err, res) {
                count++;
                if (count === 1) {
                    res.send('baz');
                } else if (count === 2) {
                    expect(err).to.be.an('object');
                    expect(err.message).to.equal('Response#send was already called');
                    done();
                }
            });
            response.send('foo');
        });
    });
});

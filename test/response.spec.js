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
        it('should call the callback', (done) => {
            const response = new Response(new Request(reqOpts), function (err) {
                expect(err).to.eql(null);
                done();
            });
            response.send('foo');
        });

        it('should pass through the payload', (done) => {
            const response = new Response(new Request(reqOpts), (err, res) => {
                expect(res).to.eql(response);
                expect(res.data).to.eql('foo');
                done();
            });
            response.send('foo');
        });

        it('should pass through errors', (done) => {
            const response = new Response(new Request(reqOpts), (err, res) => {
                expect(err).to.be.an.instanceof(Error);
                expect(res).to.be.undefined;
                done();
            });
            response.send(new Error('bar'));
        });

        it('cannot be called twice', (done) => {
            let count = 0;
            const response = new Response(new Request(reqOpts), (err, res) => {
                count++;
                if (count === 1) {
                    res.send('baz');
                } else if (count === 2) {
                    expect(err).to.be.an('error');
                    expect(err.message).to.equal('Response#send was already called');
                    done();
                }
            });
            response.send('foo');
        });
    });
});

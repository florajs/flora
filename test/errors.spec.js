'use strict';

var errors = require('../lib/errors');
var RequestError = errors.RequestError;
var AuthenticationError = errors.AuthenticationError;
var AuthorizationError = errors.AuthorizationError;
var NotFoundError = errors.NotFoundError;
var ImplementationError = errors.ImplementationError;
var DataError = errors.DataError;

var expect = require('chai').expect;

describe('error objects', function () {
    describe('RequestError', function () {
        it('has correct class hierarchy (for instanceof)', function () {
            try {
                throw new RequestError('an error occurred');
            } catch (e) {
                expect(e).to.be.an.instanceof(RequestError);
                expect(e).to.not.be.an.instanceof(ImplementationError);
                expect(e).to.be.an.instanceof(Error);
            }
        });

        it('has correct name', function () {
            try {
                throw new RequestError('an error occurred');
            } catch (e) {
                expect(e.name).to.equal('RequestError');
            }
        });

        it('passes through message', function () {
            try {
                throw new RequestError('an error occurred');
            } catch (e) {
                expect(e.message).to.equal('an error occurred');
            }
        });

        it('has correct stack trace', function () {
            var expectedStackTrace;

            try {
                expectedStackTrace =
                      new Error('msg').stack; // indent of "new" must match the "new" in next line
                throw new RequestError('msg');
            } catch (e) {
                // adjust expected stack-trace:
                expectedStackTrace = expectedStackTrace.split('\n');

                // set expected name of error:
                expectedStackTrace[0] = 'Request' + expectedStackTrace[0];

                // add 1 to expected line number (identical column number):
                expectedStackTrace[1] = expectedStackTrace[1].replace(/:(\d+):(\d+)\)$/g, function (match, lineNumber, columnNumber) {
                    return ':' + (parseInt(lineNumber) + 1) + ':' + columnNumber + ')';
                });

                expectedStackTrace = expectedStackTrace.join('\n');

                expect(e.stack).to.equal(expectedStackTrace);
            }
        });
    });

    describe('AuthenticationError', function () {
        it('has correct class hierarchy (for instanceof)', function () {
            try {
                throw new AuthenticationError('an error occurred');
            } catch (e) {
                expect(e).to.be.an.instanceof(AuthenticationError);
                expect(e).to.not.be.an.instanceof(ImplementationError);
                expect(e).to.be.an.instanceof(Error);
            }
        });
    });

    describe('AuthorizationError', function () {
        it('has correct class hierarchy (for instanceof)', function () {
            try {
                throw new AuthorizationError('an error occurred');
            } catch (e) {
                expect(e).to.be.an.instanceof(AuthorizationError);
                expect(e).to.not.be.an.instanceof(ImplementationError);
                expect(e).to.be.an.instanceof(Error);
            }
        });
    });

    describe('NotFoundError', function () {
        it('has correct class hierarchy (for instanceof)', function () {
            try {
                throw new NotFoundError('an error occurred');
            } catch (e) {
                expect(e).to.be.an.instanceof(NotFoundError);
                expect(e).to.not.be.an.instanceof(ImplementationError);
                expect(e).to.be.an.instanceof(Error);
            }
        });
    });

    describe('ImplementationError', function () {
        it('has correct class hierarchy (for instanceof)', function () {
            try {
                throw new ImplementationError('an error occurred');
            } catch (e) {
                expect(e).to.be.an.instanceof(ImplementationError);
                expect(e).to.not.be.an.instanceof(RequestError);
                expect(e).to.be.an.instanceof(Error);
            }
        });
    });

    describe('DataError', function () {
        it('has correct class hierarchy (for instanceof)', function () {
            try {
                throw new DataError('an error occurred');
            } catch (e) {
                expect(e).to.be.an.instanceof(DataError);
                expect(e).to.not.be.an.instanceof(ImplementationError);
                expect(e).to.be.an.instanceof(Error);
            }
        });
    });
});

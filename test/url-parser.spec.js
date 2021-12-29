'use strict';

const { expect } = require('chai');

const parseRequest = require('../lib/url-parser');

describe('HTTP request parsing', () => {
    let httpRequest;

    beforeEach(() => {
        let dataFn;

        httpRequest = {
            flora: { status: {} },
            method: 'GET',
            headers: { 'content-type': 'application/json' },
            payload: null,
            setEncoding() {},
            on(e, fn) {
                if (e === 'data') dataFn = fn;
                if (e === 'end') {
                    if (httpRequest.payload) {
                        for (let char of httpRequest.payload) {
                            setTimeout(() => dataFn(char), 0);
                        }
                    }
                    setTimeout(() => fn(), 0);
                }
            }
        };
    });

    it('should return promise', () => {
        httpRequest.url = 'http://api.example.com/user/';
        expect(parseRequest(httpRequest)).to.be.instanceOf(Promise);
    });

    it('should resolve with null if parsing fails', (done) => {
        httpRequest.url = 'http://api.example.com/';
        parseRequest(httpRequest)
            .then((request) => {
                expect(request).to.be.null;
                done();
            })
            .catch(done);
    });

    it('should parse relative urls', (done) => {
        httpRequest.url = '/';
        parseRequest(httpRequest)
            .then((request) => {
                expect(request).to.be.null;
                done();
            })
            .catch(done);
    });

    describe('flat resources', () => {
        it('should parse resource', (done) => {
            httpRequest.url = 'http://api.example.com/user/';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('resource', 'user');
                    done();
                })
                .catch(done);
        });

        it('should parse id', (done) => {
            httpRequest.url = 'http://api.example.com/user/1337';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('id', '1337');
                    done();
                })
                .catch(done);
        });

        it('should parse format', (done) => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('format', 'jpg');
                    done();
                })
                .catch(done);
        });
    });

    describe('nested resources', () => {
        it('should parse resource', (done) => {
            httpRequest.url = 'http://api.example.com/user/image/';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('resource', 'user/image');
                    done();
                })
                .catch(done);
        });

        it('should parse id', (done) => {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('id', '1337');
                    done();
                })
                .catch(done);
        });

        it('should parse format', (done) => {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('format', 'image');
                    done();
                })
                .catch(done);
        });

        it('should parse deeply nested resources', (done) => {
            httpRequest.url = 'http://api.example.com/store/admin/customer/address/1337';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('resource', 'store/admin/customer/address');
                    done();
                })
                .catch(done);
        });
    });

    describe('query parameters', () => {
        it('should be copied', (done) => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?width=60&rotate=90';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('width', '60');
                    expect(request).to.have.property('rotate', '90');
                    done();
                })
                .catch(done);
        });

        it('should not overwrite existing request properties', (done) => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?format=tiff&resource=abc';

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request.resource).to.equal('user');
                    expect(request.format).to.equal('jpg');
                    done();
                })
                .catch(done);
        });

        it('should not be duplicated', (done) => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?width=120&resource=abc&width=200';

            parseRequest(httpRequest)
                .then(() =>
                    done(new Error('Parsing was expected to fail because querystring contains "width" parameter twice'))
                )
                .catch((err) => {
                    expect(err).to.be.an('error').and.to.have.property('message', 'Duplicate parameter "width" in URL');
                    done();
                });
        });
    });

    describe('POST payload', () => {
        it('should parse JSON payload', (done) => {
            httpRequest.url = 'http://api.example.com/user/';
            httpRequest.payload = '{"a": true}';
            httpRequest.method = 'POST';
            httpRequest.headers['content-length'] = httpRequest.payload.length;

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request.data).to.have.property('a', true);
                    expect(request._httpRequest).to.have.property('body');
                    expect(request._httpRequest.body).to.have.property('a', true);
                    done();
                })
                .catch(done);
        });

        it('should parse form-urlencoded payload', (done) => {
            httpRequest.url = 'http://api.example.com/user/';
            httpRequest.headers['content-type'] = 'application/x-www-form-urlencoded';
            httpRequest.payload = 'a=true&b=false';
            httpRequest.method = 'POST';
            httpRequest.headers['content-length'] = httpRequest.payload.length;

            parseRequest(httpRequest)
                .then((request) => {
                    expect(request).to.have.property('a', 'true');
                    expect(request).to.have.property('b', 'false');
                    expect(request._httpRequest).to.have.property('body');
                    expect(request._httpRequest.body).to.have.property('a', 'true');
                    expect(request._httpRequest.body).to.have.property('b', 'false');
                    done();
                })
                .catch(done);
        });

        it('should time out after postTimeout', (done) => {
            const slowRequest = {
                flora: { status: {} },
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'content-length': 1000
                },
                url: '/user/',
                payload: null,
                setEncoding() {},
                on() {}
            };
            parseRequest(slowRequest, { postTimeout: 10 })
                .then(() => {
                    done(new Error('Should have thrown Timeout error'));
                })
                .catch((err) => {
                    expect(err).to.be.an('error').and.to.have.property('message', 'Timeout reading POST data');
                    done();
                });
        });
    });
});

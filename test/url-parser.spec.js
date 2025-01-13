'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

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
        assert.ok(parseRequest(httpRequest) instanceof Promise);
    });

    it('should resolve with null if parsing fails', async () => {
        httpRequest.url = 'http://api.example.com/';
        const request = await parseRequest(httpRequest);
        assert.equal(request, null);
    });

    it('should parse relative urls', async () => {
        httpRequest.url = '/';
        const request = await parseRequest(httpRequest);
        assert.equal(request, null);
    });

    describe('flat resources', () => {
        it('should parse resource', async () => {
            httpRequest.url = 'http://api.example.com/user/';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'resource'));
            assert.equal(request.resource, 'user');
        });

        it('should parse id', async () => {
            httpRequest.url = 'http://api.example.com/user/1337';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'id'));
            assert.equal(request.id, '1337');
        });

        it('should parse format', async () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'format'));
            assert.equal(request.format, 'jpg');
        });
    });

    describe('nested resources', () => {
        it('should parse resource', async () => {
            httpRequest.url = 'http://api.example.com/user/image/';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'resource'));
            assert.equal(request.resource, 'user/image');
        });

        it('should parse id', async () => {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'id'));
            assert.equal(request.id, '1337');
        });

        it('should parse format', async () => {
            httpRequest.url = 'http://api.example.com/user/image/1337.image';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'format'));
            assert.equal(request.format, 'image');
        });

        it('should parse deeply nested resources', async () => {
            httpRequest.url = 'http://api.example.com/store/admin/customer/address/1337';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'resource'));
            assert.equal(request.resource, 'store/admin/customer/address');
        });
    });

    describe('query parameters', () => {
        it('should be copied', async () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?width=60&rotate=90';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'width'));
            assert.equal(request.width, '60');
            assert.ok(Object.hasOwn(request, 'rotate'));
            assert.equal(request.rotate, '90');
        });

        it('should not overwrite existing request properties', async () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?format=tiff&resource=abc';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'resource'));
            assert.equal(request.resource, 'user');
            assert.ok(Object.hasOwn(request, 'format'));
            assert.equal(request.format, 'jpg');
        });

        it('should not be duplicated', async () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?width=120&resource=abc&width=200';

            await assert.rejects(parseRequest(httpRequest), {
                message: 'Duplicate parameter "width" in URL'
            });
        });
    });

    describe('POST payload', () => {
        it('should parse JSON payload', async () => {
            httpRequest.url = 'http://api.example.com/user/';
            httpRequest.payload = '{"a": true}';
            httpRequest.method = 'POST';
            httpRequest.headers['content-length'] = httpRequest.payload.length;

            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'data'));
            assert.ok(Object.hasOwn(request.data, 'a'));
            assert.equal(request.data.a, true);

            assert.ok(Object.hasOwn(request, '_httpRequest'));
            assert.ok(Object.hasOwn(request._httpRequest, 'body'));
            assert.ok(Object.hasOwn(request._httpRequest.body, 'a'));
            assert.equal(request._httpRequest.body.a, true);
        });

        it('should parse form-urlencoded payload', async () => {
            httpRequest.url = 'http://api.example.com/user/';
            httpRequest.headers['content-type'] = 'application/x-www-form-urlencoded';
            httpRequest.payload = 'a=true&b=false';
            httpRequest.method = 'POST';
            httpRequest.headers['content-length'] = httpRequest.payload.length;

            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, 'data'));
            assert.ok(Object.hasOwn(request, 'a'));
            assert.equal(request.a, 'true');
            assert.ok(Object.hasOwn(request, 'b'));
            assert.equal(request.b, 'false');

            assert.ok(Object.hasOwn(request, '_httpRequest'));
            assert.ok(Object.hasOwn(request._httpRequest, 'body'));
            assert.ok(Object.hasOwn(request._httpRequest.body, 'a'));
            assert.equal(request._httpRequest.body.a, 'true');
            assert.ok(Object.hasOwn(request._httpRequest.body, 'b'));
            assert.equal(request._httpRequest.body.b, 'false');
        });

        it('should time out after postTimeout', async () => {
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

            await assert.rejects(parseRequest(slowRequest, { postTimeout: 10 }), {
                message: 'Timeout reading POST data'
            });
        });

        it('should remove protected properties (GET)', async () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?_auth=FOO';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, '_auth'));
            assert.equal(request._auth, null);
        });

        it('should remove protected properties (urlencoded)', async () => {
            httpRequest.url = 'http://api.example.com/user/';
            httpRequest.headers['content-type'] = 'application/x-www-form-urlencoded';
            httpRequest.payload = '_auth=FOO';
            httpRequest.method = 'POST';
            httpRequest.headers['content-length'] = httpRequest.payload.length;

            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, '_auth'));
            assert.equal(request._auth, null);
        });

        it('should remove protected properties (JSON)', async () => {
            httpRequest.url = 'http://api.example.com/user/';
            httpRequest.payload = '{"_auth": "FOO"}';
            httpRequest.method = 'POST';
            httpRequest.headers['content-length'] = httpRequest.payload.length;

            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, '_auth'));
            assert.equal(request._auth, null);
        });
    });
});

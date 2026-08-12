'use strict';

const { Readable } = require('node:stream');
const http = require('node:http');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const parseRequest = require('../lib/url-parser');

/**
 * Build a request stream. Without a body, the stream never ends (useful for
 * timeout tests). A string body is delivered as a single chunk; an array of
 * chunks (e.g. `[...body]` for one chunk per character) forces the consumer
 * to read and reassemble the body across multiple reads.
 */
function createRequest({ method = 'GET', headers = {}, body } = {}) {
    const req = body === undefined ? new Readable({ read() {} }) : Readable.from(body);
    req.method = method;
    req.headers = headers;
    req.flora = { status: {} };
    return req;
}

describe('HTTP request parsing', () => {
    let httpRequest;

    beforeEach(() => {
        httpRequest = createRequest({ headers: { 'content-type': 'application/json' } });
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
            const body = '{"a":true}';
            const req = createRequest({
                method: 'POST',
                headers: { 'content-type': 'application/json', 'content-length': body.length },
                body: [...body]
            });
            req.url = 'http://api.example.com/user/';

            const request = await parseRequest(req);

            assert.ok(Object.hasOwn(request, 'data'));
            assert.ok(Object.hasOwn(request.data, 'a'));
            assert.equal(request.data.a, true);

            assert.ok(Object.hasOwn(request, '_httpRequest'));
            assert.ok(Object.hasOwn(request._httpRequest, 'body'));
            assert.ok(Object.hasOwn(request._httpRequest.body, 'a'));
            assert.equal(request._httpRequest.body.a, true);
        });

        it('should parse form-urlencoded payload', async () => {
            const body = 'a=true&b=false';
            const req = createRequest({
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': body.length },
                body: [...body]
            });
            req.url = 'http://api.example.com/user/';

            const request = await parseRequest(req);

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

        it('should parse a payload delivered asynchronously across multiple ticks', async () => {
            const body = '{"a":true}';

            async function* delayedChunks() {
                for (const char of body) {
                    await new Promise((resolve) => setTimeout(resolve, 1));
                    yield char;
                }
            }

            const req = createRequest({
                method: 'POST',
                headers: { 'content-type': 'application/json', 'content-length': body.length },
                body: delayedChunks()
            });
            req.url = 'http://api.example.com/user/';

            const request = await parseRequest(req, { postTimeout: 1000 });

            assert.equal(request.data.a, true);
        });

        [
            {
                description: 'should reject POST with malformed Content-Type header',
                mutate: (headers) => (headers['content-type'] = ';;;not a valid content type;;;'),
                message: 'Error parsing Content-Type header'
            },
            {
                description: 'should reject POST with missing Content-Type header',
                mutate: (headers) => delete headers['content-type'],
                message: 'Missing required Content-Type headers'
            },
            {
                description: 'should reject POST with empty Content-Type header',
                mutate: (headers) => (headers['content-type'] = ''),
                message: 'Missing required Content-Type headers'
            }
        ].forEach(({ description, mutate, message }) => {
            it(description, async () => {
                const body = '{"a":true}';
                const headers = { 'content-type': 'application/json', 'content-length': body.length };
                mutate(headers);

                const req = createRequest({ method: 'POST', headers, body: [...body] });
                req.url = 'http://api.example.com/user/';

                await assert.rejects(parseRequest(req), {
                    name: 'RequestError',
                    message
                });
            });
        });

        it('should time out after postTimeout', async () => {
            const slowRequest = createRequest({
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'content-length': 1000
                }
                // no body -> stream never ends -> postTimeout must fire
            });
            slowRequest.url = '/user/';

            await assert.rejects(parseRequest(slowRequest, { postTimeout: 10 }), {
                message: 'Timeout reading POST data'
            });
        });

        it('should reject if the request stream emits an error', async () => {
            const req = createRequest({
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'content-length': 1000
                }
                // no body -> stream stays open until destroyed below
            });
            req.url = '/user/';

            const pending = parseRequest(req);
            req.destroy(new Error('socket hang up'));

            await assert.rejects(pending, {
                name: 'RequestError',
                message: 'Error reading HTTP-Request: socket hang up'
            });
        });

        it('should remove protected properties (GET)', async () => {
            httpRequest.url = 'http://api.example.com/user/1337.jpg?_auth=FOO';
            const request = await parseRequest(httpRequest);

            assert.ok(Object.hasOwn(request, '_auth'));
            assert.equal(request._auth, null);
        });

        it('should remove protected properties (urlencoded)', async () => {
            const body = '_auth=FOO';
            const req = createRequest({
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': body.length },
                body: [...body]
            });
            req.url = 'http://api.example.com/user/';

            const request = await parseRequest(req);

            assert.ok(Object.hasOwn(request, '_auth'));
            assert.equal(request._auth, null);
        });

        it('should remove protected properties (JSON)', async () => {
            const body = '{"_auth":"FOO"}';
            const req = createRequest({
                method: 'POST',
                headers: { 'content-type': 'application/json', 'content-length': body.length },
                body: [...body]
            });
            req.url = 'http://api.example.com/user/';

            const request = await parseRequest(req);

            assert.ok(Object.hasOwn(request, '_auth'));
            assert.equal(request._auth, null);
        });
    });

    describe('real requests', () => {
        let httpServer;

        /**
         * @param {function(http.IncomingMessage, http.ServerResponse): Promise<flora.Request>} onRequest -
         *   Called for each incoming request with the request (its `flora` property already set)
         *   and the response
         * @returns {Promise<number>} The port the server is listening on
         */
        function startServer(onRequest) {
            return new Promise((resolve, reject) => {
                httpServer = http.createServer((req, res) => {
                    req.flora = { status: {} };
                    onRequest(req, res);
                });
                httpServer.once('error', reject);
                httpServer.listen(0, () => resolve(httpServer.address().port));
            });
        }

        afterEach(() => new Promise((resolve) => (httpServer ? httpServer.close(resolve) : resolve())));

        it('should parse a real GET request', async () => {
            const port = await startServer((req, res) => {
                parseRequest(req).then(
                    (request) =>
                        res.end(JSON.stringify({ ok: true, resource: request.resource, width: request.width })),
                    (err) => res.end(JSON.stringify({ ok: false, message: err.message }))
                );
            });

            // Connection: close tells the server to drop the socket once the
            // response is sent, instead of keeping it open for reuse - so
            // afterEach's server.close() doesn't have to wait it out.
            const response = await fetch(`http://127.0.0.1:${port}/user/1337.jpg?width=60`, {
                headers: { connection: 'close' }
            });
            const body = await response.json();

            assert.deepEqual(body, { ok: true, resource: 'user', width: '60' });
        });

        it('should parse a real POST request with a JSON body', async () => {
            const port = await startServer((req, res) => {
                parseRequest(req).then(
                    (request) => res.end(JSON.stringify({ ok: true, data: request.data })),
                    (err) => res.end(JSON.stringify({ ok: false, message: err.message }))
                );
            });

            const response = await fetch(`http://127.0.0.1:${port}/user/`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', connection: 'close' },
                body: JSON.stringify({ a: true })
            });
            const body = await response.json();

            assert.deepEqual(body, { ok: true, data: { a: true } });
        });

        it('should reject with "HTTP request has been aborted" if the client disconnects mid-body', async () => {
            const { promise: result, resolve, reject } = Promise.withResolvers();

            const port = await startServer((req) => {
                parseRequest(req).then(resolve, reject);
            });

            const controller = new AbortController();
            fetch(`http://127.0.0.1:${port}/user/`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'content-length': '1000', connection: 'close' },
                // a streaming body keeps the request open until aborted below; a fixed
                // content-length (not chunked transfer-encoding) is required for the
                // server to enter its body-reading branch at all
                body: new ReadableStream({
                    start(streamController) {
                        streamController.enqueue(new TextEncoder().encode('{"partial":'));
                    }
                }),
                duplex: 'half',
                signal: controller.signal
            }).catch(() => {}); // aborting rejects the fetch itself; only the server-side outcome matters here

            // give the server a moment to receive the partial body before severing the connection
            await new Promise((resolve) => setTimeout(resolve, 100));
            controller.abort();

            await assert.rejects(result, {
                name: 'RequestError',
                message: 'HTTP request has been aborted'
            });
        });

        it('should time out a real request whose body never completes', async () => {
            const { promise: result, resolve, reject } = Promise.withResolvers();

            const port = await startServer((req) => {
                parseRequest(req, { postTimeout: 50 }).then(resolve, reject);
            });

            const controller = new AbortController();
            fetch(`http://127.0.0.1:${port}/user/`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'content-length': '1000', connection: 'close' },
                body: new ReadableStream({
                    start(streamController) {
                        streamController.enqueue(new TextEncoder().encode('{"partial":'));
                        // never close -> the server keeps waiting until postTimeout fires
                    }
                }),
                duplex: 'half',
                signal: controller.signal
            }).catch(() => {}); // no response is ever sent; aborted below once the assertion is done

            await assert.rejects(result, {
                name: 'RequestError',
                message: 'Timeout reading POST data'
            });

            controller.abort();
        });
    });
});

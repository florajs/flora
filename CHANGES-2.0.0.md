# Flora 2

## Breaking changes

The main change in Flora 2 is the use of Promises instead of callbacks.

This applies to all resource methods, data source execution and also to all extension methods and events (with the exception of the "item" extension, which is still synchronous).

### Resources

Resource actions must return a Promise which resolves with either an Object, Buffer or a Stream. Extensions (excluding "item") may or may not be asynchronous now.

```js
module.exports = (api) => ({
    extensions: {
        request: async ({ request }) => {
            // transform request here
        }
    },

    actions: {
        retrieve: async (request, response) => {
            return { hello: 'world' };
            // or throw an Error or return a Promise
        }
    }
});
```

### Formats

Resource action can - but do not need - to support different "formats". Format behaviour is up to the developer and not dictated by the framework:

```js
module.exports = (api) => ({
    actions: {
        retrieve: {
            default: async (request, response) => {
                // Same as if retrieve() was a function
                // Will be called when request.format == 'json' (default case)
                return { hello: 'world' };
            },
            image: async (request, response) => {
                // Additional format for retrieve
                response.header('Content-Type', 'image/png');
                // e.g. return a Buffer or Stream with image content here
            }
        }
    }
});
```

### Events

All events in `flora.Api` and `flora.Server` instances are emitted via the [promise-events](https://www.npmjs.com/package/promise-events) module, and thus can be handled sync or async:

```js
const server = new flora.Server(configPath);

server.api.on('init', () => {
    // do sync things on API initialization here
    // or, return a Promise
});

server.api.on('init', async () => {
    // do async things on API initialization here
});
```

### Data sources

Data sources expose async methods instead of callback methods:

```js
class DataSource {
    constructor(api, options) {
        this.options = options;

        api.on('init', async () => {
            // do async data source initialization here
        });
    }

    prepare() {}

    async process(req) {
        // do async things here

        return {
            totalCount: rows.length,
            data: rows
        };
    }

    async close() {
        // close connections etc.
    }
}
```

## flora

Event listeners do not support callback functions anymore but can return a Promise, so events are handled async (excluding 'item' listener).

### Api

- **init**: Is now an async function
- **close**: Is now an async function
- **execute**: Is now an async function
- **Event: "init"**: Is now emitted async
- **Event: "close"**: Is now emitted async
- **Event: "request"**: Is now emitted async
- **Event: "response"**: Is now emitted async
- **Event: "httpRequest"**: Is now emitted async
- **Resource extension "response"**: Is now executed as async function

### Master

- **run**: Is now async function
- **serverStatus**: Is now an async function (reflecting change in flora-cluster)

### Server

- **run**: Is now async function
- **close**: Is now async function

### Response

- **constructor**: Does not take `callback` argument anymore
- **send**: Method is removed (resources must send data as return value)
- **header(key, value)**: New method for setting headers
- **status(code)**: New method for setting the status code
- **type(contentType)**: New method for setting the Content-Type

### datasource-executor

- **DataSource.process**: Is now executed as async functions
- **Resource extension "preExecute"**: Is now executed as async function
- **Resource extension "postExecute"**: Is now executed as async function

### resource-processor

- **Resource extension "init"**: Is now executed as async function
- **Resource extension "request"**: Is now executed as async function

## flora-cluster

### Master

- **constructor** options.beforeReload (optional) must return a Promise
- **constructor** options.beforeShutdown (optional) must return a Promise
- **reload**: Is now an async function (instead of callback function)
- **shutdown**: Is now an async function
- **serverStatus()**: Is now an async function

### Worker

- **Worker.serverStatus()**: Is now an async function

## flora-auth-jwt

- Now uses async listeneres for "api request" events
- options.validate function must now return a Promise

## flora-csv

- **process**: Is now an async function
- **close**: Is now an async function

## flora-mongodb

- **process**: Is now an async function
- **close**: Is now an async function

## flora-elasticsearch

- **process**: Is now an async function
- **close**: Is now an async function

## flora-solr

- **process**: Is now an async function
- **close**: Is now an async function

## flora-mysql

- **process**: Is now an async function
- **close**: Is now an async function

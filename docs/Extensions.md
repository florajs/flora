# Extensions

Flora can be extended in various ways. The `Api` class itself fires a set of (asynchronous) events that can be listened to, but also the resources can provide hooks that are executed during request handling.

## Events

Events are emitted using the [promise-events](https://www.npmjs.com/package/promise-events) module, so they are emitted asynchronously. Listeners can, but do not need to, be implemented as async functions.

### Example

```js
const flora = require('flora');

const server = new flora.Server('./config.js');
server.run();

server.api.on('init', async () => {
    // Do async things during the API initialization
});
```

- **Api#init**: Emitted after data sources have been initialized and the instance is ready.
- **Api#request ({ request, response })**: Emitted before a request is handled.
- **Api#httpRequest ({ httpRequest, httpResponse })**: Emitted before a HTTP request is handled.
- **Api#response ({ request, response })**: Emitted before a response is returned by the execute() method.
- **Api#close**: Emitted when the instance has closed.

### Full example

Here is a full example with all events:

```js
const flora = require('flora');

const server = new flora.Server('./config.js');
server.run();

// Event: "init"
// is called when Api is done initializing.
server.api.on('init', () => {
    server.api.log.info('Extension: api init');
});

// Event: "close"
// is called when Api is closing.
server.api.on('close', () => {
    server.api.log.info('Extension: api close');
});

// Event: "request"
// is called on each request, before the request is handled.
server.api.on('request', ({ request, response }) => {
    server.api.log.info('Extension: api request');
    request.limit = 1; // modify the "limit" parameter
    request.select = 'foo'; // modify the "select" parameter to always select (only) the "foo" attribute
    // we could throw an error if something goes wrong here
});

// Event: "httpRequest"
// is called before any flora.Request instanciation and allows modifying HTTP headers
server.api.on('httpRequest', ({ httpRequest, httpResponse }) => {
    server.api.log.info('Extension: api httpRequest');
    httpResponse.setHeader('X-Hello', 'World');
});

// Event: "response"
// is called after the request is handled and before the response is sent.
server.api.on('response', ({ request, response }) => {
    server.api.log.info('Extension: api response');

    // modify response: add "baz: 'foo'" property to the complete response
    if (Array.isArray(response.data)) {
        // list response
        if (response.data.length > 0) response.data[0].baz = 'foo';
    } else {
        // single response
        response.data.baz = 'foo';
    }
});
```

## Extensions in resources

Resources can provide hooks that are executed when a request for this resource is handled.

**resources/hello/index.js**

```js
module.exports = (api) => ({
    extensions: {
        request: async ({ request, response }) => {
            // Do things for each request
        },

        item: ({ item, row, request }) => {
            // Do things for each item, whether it is handled directly by this resource
            // or as a sub-resource from somewhere else
        }
    }
    ...
});
```

- **init**: Called when the API is initialized.
- **request ({ request, response })**: Called when the resource is executed directly (via resource-processor – note that actions that do not use the resource-processor will not call this extension).
- **item ({ item, row, request })**: Called for each item of this resource. For lists this method is called for each item of the list. When items of this resource are included by another resource, this method is also called for each of these items. **Note: this is the only method that is synchronous.**
- **preExecute ({ request, dataSourceTree, floraRequest })**: Called after the data source tree has been resolved. May be used for internal optimizations.
- **postExecute ({ request, floraRequest, rawResults })**: Called after the request has been executed and before the response is being built.
- **response**: Called before the response is being sent.

### Full example

```js
module.exports = api => ({
    extensions: {
        // Extension: "init"
        // is called once upon startup, when all resources are initialized
        init: async function() {
            api.log.info('Extension: resource init');
        },

        // Extension: "request"
        request: async function(/* { request, response } */) {
            api.log.info('Extension: resource request');
        },

        // Extension: "item"
        // is called for every item that is handled by the resource-processor, also when the
        // resource is called as sub-resource from another resource.
        item: function({ item /* , row, secondaryRows, request, getAttribute, getResult, buildItem */ }) {
            api.log.info('Extension: resource item');
            item.bar = 'baz';
        },

        // Extension: "preExecute"
        // is called after the request-resolver has resolved the dataSourceTree.
        preExecute: async function(/* { request, dataSourceTree, floraRequest } */) {
            api.log.info('Extension: resource preExecute');
        },

        // Extension: "postExecute"
        // is called after the request has been executed and before the response is being built
        postExecute: async function(/* { request, floraRequest, rawResults } */) {
            api.log.info('Extension: resource postExecute');
        },

        // Extension: "preExecute" / "postExecute"
        // when having more data-sources than just "primary" you can reference them individually:
        preExecute_or_postExecute: {
            primary: async function(/* { request, dataSourceTree, floraRequest } */) {
                api.log.info('Extension: resource preExecute for "primary" data-source');
            },
            fulltextSearch: async function(/* { request, dataSourceTree, floraRequest } */) {
                api.log.info('Extension: resource preExecute for "fulltextSearch" data-source');
            }
        },

        // Extension: "response"
        response: function(/* { request, response } */) {
            api.log.info('Extension: resource response');
        },

        // Sub-Resources: for every (inline or included) sub-resource you can define individual extensions.
        // works for: preExecute, postExecute, item
        // if an included sub-resource defines the same extension it is executed first:
        subResources: {
            'addresses.country': {
                preExecute: async function(/* { request, dataSourceTree, floraRequest } */) {
                    api.log.info('Extension: resource preExecute');
                }
            }
        }
    },

    actions: {
        retrieve: function(request, response) {
            return api.resourceProcessor.handle(request, response);
        }
    }
});
```

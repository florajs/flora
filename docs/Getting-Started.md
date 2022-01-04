# Getting Started

## Installation

    npm install flora --save

## Configuration

The configuration needs to be a CommonJS module file that exports an object.

### config.js

```js
const path = require('path');

module.exports = {
    // Location of main server script when run in cluster mode
    exec: path.join(__dirname, 'server.js'),

    // HTTP port
    port: 3000,

    // Location of resource files
    resourcesPath: path.join(__dirname, 'resources')
};
```

## A simple API server

### server.js

```js
const flora = require('flora');

const server = new flora.Server('./config.js');
server.run();
```

## Your first resource

The `hello` resource is a simple Hello World endpoint.

### resources/hello/index.js

```js
module.exports = (api) => ({
    actions: {
        retrieve: () => {
            return "Hello World";
        },
        hello: (request) => {
            return `Hello ${request.name || 'User'}`;
        }
    }
});
```

The default `retrieve` action can now be called with

    http://localhost:3000/hello/

To call the `hello` action, set the `action` parameter. For this example, we also pass some input parameter, `name`:

    http://localhost:3000/hello/?action=hello&name=Alice

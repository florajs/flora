# Flora

## Cluster

Flora includes simple but powerful clustering tools. The [flora-cluster](https://www.npmjs.com/package/flora-cluster) module provides tools for spawning and monitoring processes to optimize CPU usage on multi-core machines.

### Example

#### config.js

```js
const path = require('path');

module.exports = {
    exec: path.join(__dirname, 'server.js'),
    port: 3000,
    resourcesPath: path.join(__dirname, 'resources')
};
```

#### server.js

```js
const path = require('path');
const flora = require('flora');

const server = new flora.Server(path.join(__dirname, 'config.js'));
server.run();
```

#### cluster.js

```js
const path = require('path');
const flora = require('flora');

const master = new flora.Master(path.join(__dirname, 'config.js'));
master.run();
```

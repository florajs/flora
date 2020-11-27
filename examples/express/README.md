# Flora and Express

This is an example for an adapter between Flora and Express.

```js
const express = require('express');
const flora = require('flora');
const path = require('path');
const floraExpress = require('./');

// Flora
const configPath = path.join(__dirname, 'config.example.js');
const api = new flora.Api();
const config = require(configPath);

// Express
const app = express();
app.get('/', (req, res) => res.send('Hello World!'));
app.use('/api', floraExpress(api));

await api.init(config);

app.listen(3000);
```

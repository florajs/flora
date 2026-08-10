const path = require('node:path');
const flora = require('flora');

const master = new flora.Master(path.join(__dirname, 'config.js'));
master.run();

const flora = require('flora');

const server = new flora.Server(require('path').join(__dirname, 'config.js'));

server.run();

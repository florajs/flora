const flora = require('flora');

var server = new flora.Server(require('path').join(__dirname, 'config.js'));

server.run();

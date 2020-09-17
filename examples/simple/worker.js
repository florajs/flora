const path = require('path');
const flora = require('flora');

const server = new flora.Server(path.join(__dirname, 'config.example.js'));
server.run();

'use strict';

const path = require('path');
const flora = require('../');

// Entry point without cluster:
const server = new flora.Server(path.join(__dirname, 'config.example.js'));
server.run();

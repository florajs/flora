'use strict';

var path = require('path');
var flora = require('../');

// Entry point without cluster:
var server = new flora.Server(path.join(__dirname, 'config.example.js'));
server.run();

'use strict';

var path = require('path');
var flora = require('../');

// Entry point with cluster:
var master = new flora.Master(path.join(__dirname, 'config.example.js'));
master.run();

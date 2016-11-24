'use strict';

const path = require('path');
const flora = require('../');

// Entry point with cluster:
const master = new flora.Master(path.join(__dirname, 'config.example.js'));
master.run();

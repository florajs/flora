const path = require('path');

module.exports = {
    exec: path.join(__dirname, 'worker.js'),
    port: 3000,
    resourcesPath: path.join(__dirname, 'resources')
};

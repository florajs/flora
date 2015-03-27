'use strict';

var bunyan = require('bunyan');
var ClusterMaster = require('flora-cluster').Master;
var watch = require('./watch');
var path = require('path');

/**
 * A wrapper around the flora-cluster master.
 *
 * @constructor
 * @param {string} configPath
 */
var Master = module.exports = function Master(configPath) {
    this._configPath = configPath;
    this._clusterMaster = null;

    this.config = null;
    this.log = null;
};

/**
 * Run the cluster master process.
 *
 * Loads the config, runs flora-cluster master and (optionally) watches the
 * filesystem for changes.
 *
 * @param {Function} callback
 */
Master.prototype.run = function (callback) {
    var self = this;

    this._reloadConfig();

    var log = this.log = this.log || this.config.log || bunyan.createLogger({name: 'flora', component: 'master'});

    this._clusterMaster = new ClusterMaster({
        exec: this.config.exec,
        workers: this.config.workers,
        log: this.log,
        startupTimeout: this.config.startupTimeout,
        shutdownTimeout: this.config.shutdownTimeout,
        beforeReload: this._beforeReload.bind(this),
        beforeShutdown: this._beforeShutdown.bind(this)
    });

    this._clusterMaster.run();

    if (this.config.reloadOnChange) {
        var watchPaths = [
            this._configPath,
            this.config.resourcesPath,
            __dirname,
            path.join(__dirname, '..')
        ];

        log.info({watchPaths: watchPaths}, 'Watching filesystem for changes');

        var onFileChange = function () {
            self._clusterMaster.reload();

            watch(watchPaths, onFileChange);
        };

        watch(watchPaths, onFileChange);
    }

    if (callback) return callback(null);
};

/**
 * Called before the master process is reloaded.
 *
 * @param {Function} callback
 * @private
 */
Master.prototype._beforeReload = function (callback) {
    this._reloadConfig();

    this._clusterMaster.setConfig({
        workers: this.config.workers,
        log: this.log,
        startupTimeout: this.config.startupTimeout,
        shutdownTimeout: this.config.shutdownTimeout
    });

    callback();
};

/**
 * Called before the master process is shut down.
 *
 * @param {Function} callback
 * @private
 */
Master.prototype._beforeShutdown = function (callback) {
    watch(); // remove watcher
    callback();
};

/**
 * Reloads the config. Usually called before the master process is reloaded.
 *
 * @private
 */
Master.prototype._reloadConfig = function () {
    var resolvedConfigPath = require.resolve(this._configPath);
    delete require.cache[resolvedConfigPath];
    this.config = require(resolvedConfigPath);
};

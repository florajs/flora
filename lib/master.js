'use strict';

var bunyan = require('bunyan');
var ClusterMaster = require('flora-cluster').Master;
var chokidar = require('chokidar');
var path = require('path');
var util = require('util');
var AsyncEventEmitter = require('async-eventemitter');

/**
 * A wrapper around the flora-cluster master.
 *
 * @constructor
 * @param {string} configPath
 */
var Master = module.exports = function Master(configPath) {
    if (!configPath) throw new Error('Master must be called with a configPath parameter');

    this._configPath = configPath;
    this._clusterMaster = null;
    this._watcher = null;
    this._reloadTimeout = null;
    this._plugins = [];

    this.config = null;
    this.log = null;

    AsyncEventEmitter.call(this);
};

util.inherits(Master, AsyncEventEmitter);

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
    callback = callback || function () {};

    this._clusterMaster = new ClusterMaster({
        exec: this.config.exec,
        workers: this.config.workers,
        log: this.log,
        startupTimeout: this.config.startupTimeout,
        shutdownTimeout: this.config.shutdownTimeout,
        beforeReload: this._beforeReload.bind(this),
        beforeShutdown: this._beforeShutdown.bind(this)
    });

    for (var idx in this._plugins) {
        this.log.debug('Registering master plugin' + (this._plugins[idx][0].name ? ' "' + this._plugins[idx][0].name + '"': ''));
    }

    this._clusterMaster.on('init', function () {
        self.emit('init');
    });

    this._clusterMaster.on('shutdown', function () {
        self.emit('shutdown');
    });

    this._clusterMaster.run();

    if (this.config.reloadOnChange) {
        var watchPaths = [
            this._configPath,
            path.join(__dirname, '..')
        ];

        if (this.config.resourcesPath) watchPaths.push(this.config.resourcesPath);

        log.info({watchPaths: watchPaths}, 'Watching filesystem for changes');

        this._watcher = chokidar.watch(watchPaths, {
            ignoreInitial: true,
            ignored: ['.*', '**/node_modules', '**/.*', '**/build/*', '**/test/*'],
            interval: 2000,
            usePolling: false
        }).on('all', function (event, p) {
            log.info('watcher: ' + event + ': ' + p);
            if (self._reloadTimeout) clearTimeout(self._reloadTimeout);
            self._reloadTimeout = setTimeout(function () {
                self._clusterMaster.reload();
            }, self.config.reloadTimeout || 1000);
        });
    }
};

/**
 * Retrieve the cluster status
 *
 * @param {Function} callback
 * @api public
 */
Master.prototype.serverStatus = function (callback) {
    return this._clusterMaster.serverStatus(callback);
};

/**
 * Register a plugin.
 *
 * The plugin has to be an object with a "register" function property, which is called with
 * parameters (master, options).
 *
 * @param {Object} plugin
 * @param {Object} options
 */
Master.prototype.register = function (plugin, options) {
    if (typeof plugin !== 'object' || typeof plugin.register !== 'function') {
        throw new Error('The plugin must provide a "register" function');
    }

    this._plugins.push([plugin, options]);
    if (this._clusterMaster) plugin.register(this, options);
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
    if (this._reloadTimeout) clearTimeout(this._reloadTimeout);
    if (this._watcher) this._watcher.close();
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

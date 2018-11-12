'use strict';

const path = require('path');

const bunyan = require('bunyan');
const ClusterMaster = require('flora-cluster').Master;
const chokidar = require('chokidar');
const PromiseEventEmitter = require('promise-events');

/**
 * A wrapper around the flora-cluster master.
 */
class Master extends PromiseEventEmitter {
    /**
     * @param {string} configPath
     */
    constructor(configPath) {
        super();

        if (!configPath) throw new Error('Master must be called with a configPath parameter');

        this._configPath = configPath;
        this._clusterMaster = null;
        this._watcher = null;
        this._reloadTimeout = null;
        this._plugins = [];

        this.config = null;
        this.log = null;
    }

    /**
     * Run the cluster master process.
     *
     * Loads the config, runs flora-cluster master and (optionally) watches the
     * filesystem for changes.
     *
     * @return {Promise}
     */
    async run() {
        this._reloadConfig();

        this.log = this.log || this.config.log || bunyan.createLogger({ name: 'flora', component: 'master' });
        const log = this.log;

        this._clusterMaster = new ClusterMaster({
            exec: this.config.exec,
            workers: this.config.workers,
            log: this.log,
            startupTimeout: this.config.startupTimeout,
            shutdownTimeout: this.config.shutdownTimeout,
            beforeReload: this._beforeReload.bind(this),
            beforeShutdown: this._beforeShutdown.bind(this)
        });

        this._plugins.forEach((plugin) => {
            const [obj, options] = plugin;
            this.log.debug(`Registering master plugin "${obj.name || '(unnamed)'}"`);
            obj.register(this, options);
        });

        this._clusterMaster.on('init', () => this.emit('init'));

        this._clusterMaster.on('shutdown', () => this.emit('shutdown'));

        this._clusterMaster.run();

        if (this.config.reloadOnChange) {
            const watchPaths = [
                this._configPath,
                path.join(__dirname, '..')
            ];

            if (this.config.resourcesPath) watchPaths.push(this.config.resourcesPath);

            log.info({ watchPaths }, 'Watching filesystem for changes');

            this._watcher = chokidar.watch(watchPaths, {
                ignoreInitial: true,
                ignored: ['.*', '**/node_modules', '**/.*', '**/build/*', '**/test/*'],
                interval: 2000,
                usePolling: false
            }).on('all', (event, p) => {
                log.info(`watcher: ${event}: ${p}`);
                if (this._reloadTimeout) clearTimeout(this._reloadTimeout);
                this._reloadTimeout = setTimeout(() => {
                    this._clusterMaster.reload();
                }, this.config.reloadTimeout || 1000);
            });
        }
    }

    /**
     * Retrieve the cluster status.
     *
     * @returns {Promise}
     */
    serverStatus() {
        return this._clusterMaster.serverStatus();
    }

    /**
     * Register a plugin.
     *
     * The plugin has to be an object with a "register" function property, which is called with
     * parameters (master, options).
     *
     * @param {Object} plugin
     * @param {Object} options
     */
    register(plugin, options) {
        if (typeof plugin !== 'object' || typeof plugin.register !== 'function') {
            throw new Error('The plugin must provide a "register" function');
        }

        this._plugins.push([plugin, options]);
        if (this._clusterMaster) plugin.register(this, options);
    }

    /**
     * Called before the master process is reloaded.
     *
     * @returns {Promise}
     * @private
     */
    async _beforeReload() {
        this._reloadConfig();

        this._clusterMaster.setConfig({
            workers: this.config.workers,
            log: this.log,
            startupTimeout: this.config.startupTimeout,
            shutdownTimeout: this.config.shutdownTimeout
        });
    }

    /**
     * Called before the master process is shut down.
     *
     * @returns {Promise}
     * @private
     */
    async _beforeShutdown() {
        if (this._reloadTimeout) clearTimeout(this._reloadTimeout);
        if (this._watcher) this._watcher.close();
    }

    /**
     * Reloads the config. Usually called before the master process is reloaded.
     *
     * @private
     */
    _reloadConfig() {
        const resolvedConfigPath = require.resolve(this._configPath);
        delete require.cache[resolvedConfigPath];
        // eslint-disable-next-line global-require, import/no-dynamic-require
        this.config = require(resolvedConfigPath);
    }
}

module.exports = Master;

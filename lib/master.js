'use strict';

const path = require('path');

const bunyan = require('bunyan');
const ClusterMaster = require('@florajs/cluster').Master;
const chokidar = require('chokidar');
const PromiseEventEmitter = require('promise-events');

/**
 * @event Master#init
 * @description Emitted when the cluster master is done initializing.
 */

/**
 * @event Master#shutdown
 * @description Emitted when the cluster master has shut down.
 */

/**
 * A wrapper around the @florajs/cluster master.
 */
class Master extends PromiseEventEmitter {
    /**
     * @param {string} configPath - Path to a config file that exports the configuration
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
     * Loads the config, runs master and (optionally) watches the
     * filesystem for changes.
     *
     * @return {Promise}
     * @fires Master#init
     * @fires Master#shutdown
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

        Object.keys(this._plugins).forEach((name) => {
            const [plugin, options] = this._plugins[name];
            this.log.debug(`Registering master plugin "${name}"`);
            plugin(this, options);
        });

        this._clusterMaster.on('init', () => this.emit('init'));

        this._clusterMaster.on('shutdown', () => this.emit('shutdown'));

        this._clusterMaster.run();

        if (this.config.reloadOnChange) {
            const watchPaths = [this._configPath, path.join(__dirname, '..')];

            if (this.config.resourcesPath) watchPaths.push(this.config.resourcesPath);

            log.info({ watchPaths }, 'Watching filesystem for changes');

            this._watcher = chokidar
                .watch(watchPaths, {
                    ignoreInitial: true,
                    ignored: ['.*', '**/node_modules', '**/.*', '**/build/*', '**/test/*'],
                    interval: 2000,
                    usePolling: false
                })
                .on('all', (event, p) => {
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
     * @returns {Promise<Object>}
     */
    serverStatus() {
        return this._clusterMaster.serverStatus();
    }

    /**
     * Register a plugin.
     *
     * The plugin has to be a function, which is called with parameters (master, options).
     *
     * @param {string} name - Plugin name
     * @param {Object} function - Plugin function
     * @param {Object} [options] - Configuration options that are passed to the function
     */
    register(name, plugin, options) {
        if (this._plugins[name]) throw new Error(`Plugin "${name}" already registered.`);
        this._plugins[name] = [plugin, options];
        if (this._clusterMaster) plugin(this, options);
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
        // eslint-disable-next-line global-require
        this.config = require(resolvedConfigPath);
    }
}

module.exports = Master;

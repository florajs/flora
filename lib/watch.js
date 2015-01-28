'use strict';

var fs = require('fs');

var gracePeriod = 200;
var watchers = [];
var timeout = null;

/**
 * Watch a single file/path or a list of files/paths and trigger callback on changes.
 *
 * Note: may not watch sub-directories
 *
 * @param {(Array.<string>|string)} paths
 * @param {Function} callback
 */
module.exports = function watch(paths, callback) {
    watchers.forEach(function (watcher) {
        watcher.close();
    });

    if (! callback) return;

    if (! Array.isArray(paths)) paths = [paths];

    paths.forEach(function (watchPath) {
        watchers.push(fs.watch(watchPath, function onFileEvent(event, filename) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }

            timeout = setTimeout(function onFsChanged() {
                timeout = null;
                callback(event, filename);
            }, gracePeriod);
        }));
    });
};

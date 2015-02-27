/**
 * @module xml-reader
 */
'use strict';

var fs = require('fs'),
    Promise = require('when').Promise,
    libxmljs = require('libxmljs'),
    _ = require('lodash');

/**
 * @param {string} file
 * @return {Promise}
 * @private
 */
function readXml(file) {
    return new Promise(function (resolve, reject) {
        fs.readFile(file, function (err, buffer) {
            var doc;

            if (err) return reject(err);

            try {
                doc = libxmljs.parseXml(buffer.toString());
            } catch (e) {
                return reject(e);
            }

            resolve(doc.root());
        });
    });
}

/**
 * Return DataSources, attributes and sub-resources as plain JS object.
 *
 * @param {Object} node
 * @return {Object}
 * @private
 */
function parse(node) {
    var cfg = _.assign({}, copyXmlAttributes(node));

    node.childNodes()
        .filter(function (el) {
            return el.type() === 'element';
        })
        .forEach(function (el) {
            var name = el.name(),
                namespace = el.namespace(),
                dataSource;

            if (namespace === null) { // attribute elements
                if (!cfg.attributes) cfg.attributes = {};
                cfg.attributes[name] = el.childNodes().length ? parse(el) : copyXmlAttributes(el);
            } else if (namespace.href() === 'urn:flora:options') { // flora specific elements
                if (name === 'dataSource') {
                    dataSource = getDataSource(el);
                    if (!cfg.dataSources) cfg.dataSources = {};
                    if (cfg.dataSources[dataSource.name]) {
                        throw new Error('Data source "' + dataSource.name + '" already exists');
                    }
                    cfg.dataSources[dataSource.name] = dataSource.config;
                }
                if (name === 'subFilter') {
                    if (!cfg.subFilters) cfg.subFilters = [];
                    cfg.subFilters.push(copyXmlAttributes(el));
                }
            }
        });

    return cfg;
}

/**
 * @param node
 * @return {Object}
 * @private
 */
function copyXmlAttributes(node) {
    var cfg = {};

    node.attrs()
        .forEach(function (attr) {
            cfg[attr.name()] = attr.value();
        });

    return cfg;
}

/**
 * Extract config from dataSource nodes.
 *
 * @param {Object} node
 * @return {Object}
 * @private
 */
function getDataSource(node) {
    var config = _.assign({}, copyXmlAttributes(node)),
        name;

    if (node.childNodes().length) config.query = node.text().trim();

    name = config.name ? config.name : 'primary';
    if (config.name) delete config.name;

    return {
        name: name,
        config: config
    };
}

/**
 * Create resource config object tree from XML file.
 *
 * @param {string} file
 * @param {Function} callback
 */
module.exports = function (file, callback) {
    readXml(file)
        .then(parse)
        .then(function (config) {
            callback(null, config);
        })
        .catch(callback);
};

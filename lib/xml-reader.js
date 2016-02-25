/**
 * @module xml-reader
 */
'use strict';

var fs = require('fs');

//noinspection JSUnresolvedVariable
var Promise = require('when').Promise;
var _ = require('lodash');
var DOMParser = require('xmldom').DOMParser;

var ELEMENT_NODE = 1;

/**
 * @param {string} file
 * @return {Promise}
 * @private
 */
function readXml(file) {
    return new Promise(function (resolve, reject) {
        fs.readFile(file, 'utf8', function (err, content) {
            var dom, parseError;

            if (err) return reject(err);

            //noinspection JSUnusedGlobalSymbols
            dom = new DOMParser({
                errorHandler: function (message) {
                    parseError = new Error(message);
                }
            }).parseFromString(content, 'text/xml');

            if (parseError) return reject(parseError);

            resolve(dom.documentElement);
        });
    });
}

/**
 * Return DataSources, attributes and sub-resources as plain JS object.
 *
 * @param {Node} node
 * @return {Object}
 * @private
 */
function parse(node) {
    var el, dataSource,
        cfg = _.assign({}, copyXmlAttributes(node));

    for (var i = 0, l = node.childNodes.length; i < l; ++i) {
        el = node.childNodes.item(i);
        if (el.nodeType !== ELEMENT_NODE) continue;

        if (!el.namespaceURI) { // attribute elements
            if (!cfg.attributes) cfg.attributes = {};
            cfg.attributes[el.localName] = el.childNodes.length ? parse(el) : copyXmlAttributes(el);
        } else if (el.namespaceURI === 'urn:flora:options') { // flora specific elements
            if (el.localName === 'dataSource') {
                dataSource = getDataSource(el);
                if (!cfg.dataSources) cfg.dataSources = {};
                if (cfg.dataSources[dataSource.name]) {
                    throw new Error('Data source "' + dataSource.name + '" already defined');
                }
                cfg.dataSources[dataSource.name] = dataSource.config;
            }
            if (el.localName === 'subFilter') {
                if (!cfg.subFilters) cfg.subFilters = [];
                cfg.subFilters.push(copyXmlAttributes(el));
            }
        }
    }

    return cfg;
}

/**
 * @param {Node} node
 * @return {Object}
 * @private
 */
function copyXmlAttributes(node) {
    var cfg = {}, attr;

    if (!node.hasAttributes()) return cfg;

    for (var i = 0, l = node.attributes.length; i < l; ++i) {
        attr = node.attributes.item(i);
        if (attr.prefix) continue;
        cfg[attr.localName] = attr.value;
    }

    return cfg;
}

/**
 * Extract config from dataSource nodes.
 *
 * @param {Node} node
 * @return {Object}
 * @private
 */
function getDataSource(node) {
    var config = _.assign({}, copyXmlAttributes(node)),
        name, childNode, attr;

    if (node.childNodes.length) { // parse datasource options
        for (var i = 0; i < node.childNodes.length; ++i) {
            childNode = node.childNodes.item(i);

            if (childNode.nodeType !== ELEMENT_NODE) continue;
            if (childNode.namespaceURI !== 'urn:flora:options') continue;
            if (childNode.localName !== 'option') continue;
            if (childNode.attributes.length !== 1) throw new Error('flora:option element requires a name attribute');

            attr = childNode.attributes.item(0);
            if (attr.localName !== 'name') throw new Error('flora:option element requires a name attribute');
            if (config[attr.value]) throw new Error('Data source option "' + attr.value + '" already defined');

            config[attr.value] = childNode.textContent.trim();
        }
    }

    name = config.name ? config.name : 'primary';
    if (config.name) delete config.name;

    return {name: name, config: config};
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

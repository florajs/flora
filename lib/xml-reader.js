'use strict';

const fs = require('fs');

const { DOMParser } = require('xmldom');
const { ImplementationError } = require('flora-errors');

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * @param {string} file
 * @return {Promise<Object>}
 * @private
 */
async function readXml(file) {
    const content = await fs.promises.readFile(file, { encoding: 'utf8' });
    const dom = new DOMParser({
        errorHandler: (level, message) => {
            throw new Error(message);
        }
    }).parseFromString(content, 'text/xml');

    return dom.documentElement;
}

/**
 * @param {Node} node
 * @return {Object}
 * @private
 */
function copyXmlAttributes(node) {
    const cfg = {};

    if (!node.hasAttributes()) return cfg;

    for (let i = 0, l = node.attributes.length; i < l; ++i) {
        const attr = node.attributes.item(i);
        if (!attr.prefix) cfg[attr.localName] = attr.value;
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
    const config = Object.assign({}, copyXmlAttributes(node));

    if (node.childNodes.length) {
        // parse datasource options
        for (let i = 0; i < node.childNodes.length; ++i) {
            const childNode = node.childNodes.item(i);

            if (childNode.nodeType === TEXT_NODE && childNode.textContent.trim().length > 0) {
                throw new ImplementationError(`dataSource contains useless text: "${childNode.textContent.trim()}"`);
            }

            if (
                childNode.nodeType === ELEMENT_NODE &&
                childNode.namespaceURI === 'urn:flora:options' &&
                childNode.localName === 'option'
            ) {
                if (childNode.attributes.length !== 1)
                    throw new Error('flora:option element requires a name attribute');

                const attr = childNode.attributes.item(0);
                if (attr.localName !== 'name') throw new Error('flora:option element requires a name attribute');
                if (config[attr.value]) throw new Error(`Data source option "${attr.value}" already defined`);

                config[attr.value] = childNode.textContent.trim();
            }
        }
    }

    const name = config.name ? config.name : 'primary';
    if (config.name) delete config.name;

    return { name, config };
}

/**
 * Return DataSources, attributes and sub-resources as plain JS object.
 *
 * @param {Node} node
 * @return {Object}
 * @private
 */
function parse(node) {
    const cfg = Object.assign({}, copyXmlAttributes(node));

    for (let i = 0, l = node.childNodes.length; i < l; ++i) {
        const el = node.childNodes.item(i);
        if (el.nodeType === ELEMENT_NODE) {
            if (!el.namespaceURI) {
                // attribute elements
                if (!cfg.attributes) cfg.attributes = {};
                if (cfg.attributes[el.localName]) {
                    throw new Error(`Resource already contains an attribute with name "${el.localName}"`);
                }
                cfg.attributes[el.localName] = el.childNodes.length ? parse(el) : copyXmlAttributes(el);
            } else if (el.namespaceURI === 'urn:flora:options') {
                // flora specific elements
                if (el.localName === 'dataSource') {
                    const dataSource = getDataSource(el);
                    if (!cfg.dataSources) cfg.dataSources = {};
                    if (cfg.dataSources[dataSource.name]) {
                        throw new Error(`Data source "${dataSource.name}" already defined`);
                    }
                    cfg.dataSources[dataSource.name] = dataSource.config;
                }
                if (el.localName === 'subFilter') {
                    if (!cfg.subFilters) cfg.subFilters = [];
                    cfg.subFilters.push(copyXmlAttributes(el));
                }
            }
        } else if (el.nodeType === TEXT_NODE && el.textContent.trim().length > 0) {
            throw new ImplementationError(`Config contains unnecessary text: "${el.textContent.trim()}"`);
        }
    }

    return cfg;
}

/**
 * Create resource config object tree from XML file.
 *
 * @param {string} file
 * @return {Promise<Object>}
 */
module.exports = async function xmlReader(file) {
    const node = await readXml(file);
    return parse(node);
};

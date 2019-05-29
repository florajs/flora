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
    if (!node.hasAttributes()) return {};

    return Array.from(node.attributes)
        .filter(attr => !attr.prefix)
        .reduce((cfg, attr) => {
            cfg[attr.localName] = attr.value;
            return cfg;
        }, {});
}

function _filterFloraOptionNodes(node) {
    const { nodeType, namespaceURI, localName, textContent } = node;

    if (nodeType === TEXT_NODE && textContent.trim().length > 0) {
        throw new ImplementationError(`dataSource contains useless text: "${node.textContent.trim()}"`);
    }

    return nodeType === ELEMENT_NODE && namespaceURI === 'urn:flora:options' && localName === 'option';
}

function _parseDatarSourceOptionNode(cfg, optionNode) {
    if (optionNode.attributes.length !== 1) {
        throw new Error('flora:option element requires a name attribute');
    }

    const attr = optionNode.attributes.item(0);
    if (attr.localName !== 'name') throw new Error('flora:option element requires a name attribute');
    if (cfg[attr.value]) throw new Error(`Data source option "${attr.value}" already defined`);

    cfg[attr.value] = optionNode.textContent.trim();
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
    const config = Object.assign(
        {},
        copyXmlAttributes(node),
        Array.from(node.childNodes)
            .filter(_filterFloraOptionNodes)
            .reduce(_parseDatarSourceOptionNode, {})
    );

    const { name = 'primary' } = config;
    if (config.name) delete config.name;

    return { name, config };
}

function _parseBasicAttribute(cfg, node) {
    cfg.attributes = cfg.attributes || {};

    if (cfg.attributes[node.localName]) {
        throw new Error(`Resource already contains an attribute with name "${node.localName}"`);
    }

    cfg.attributes[node.localName] = node.childNodes.length ? parse(node) : copyXmlAttributes(node);

    return cfg;
}

function _parseDataSourceNode(cfg, node) {
    const dataSource = getDataSource(node);

    cfg.dataSources = cfg.dataSources || {};
    if (cfg.dataSources[dataSource.name]) {
        throw new Error(`Data source "${dataSource.name}" already defined`);
    }

    cfg.dataSources[dataSource.name] = dataSource.config;

    return cfg;
}

function _parseSubFilterNode(cfg, node) {
    cfg.subFilters = cfg.subFilters || [];
    cfg.subFilters.push(copyXmlAttributes(node));
    return cfg;
}

/**
 * Return DataSources, attributes and sub-resources as plain JS object.
 *
 * @param {Node} node
 * @return {Object}
 * @private
 */
function parse(node) {
    const childNodes = Array.from(node.childNodes);

    childNodes
        .filter(node => node.nodeType === TEXT_NODE)
        .filter(node => node.textContent.trim().length > 0)
        .forEach(node => {
            throw new ImplementationError(`Config contains unnecessary text: "${node.textContent.trim()}"`);
        });

    const elementNodes = childNodes.filter(node => node.nodeType === ELEMENT_NODE);
    const floraNodes = elementNodes.filter(node => node.namespaceURI === 'urn:flora:options');

    return Object.assign(
        {},
        copyXmlAttributes(node),
        elementNodes.filter(node => !node.namespaceURI).reduce(_parseBasicAttribute, {}),
        floraNodes.filter(node => node.localName === 'dataSource').reduce(_parseDataSourceNode, {}),
        floraNodes.filter(node => node.localName === 'subFilter').reduce(_parseSubFilterNode, {})
    );
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

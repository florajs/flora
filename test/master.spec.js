'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Master = require('../lib/master');

describe('Master', () => {
    it('should be a function', () => {
        assert.equal(typeof Master, 'function');
    });

    it('should be instantiable', () => {
        assert.equal(typeof new Master(path.join(__dirname, 'fixtures', 'master-config.js')), 'object');
    });

    it('should allow to register plugins', () => {
        const plugin = {
            register: (/* master, options */) => {}
        };

        const master = new Master(path.join(__dirname, 'fixtures', 'master-config.js'));
        assert.doesNotThrow(() => master.register(plugin));
    });
});

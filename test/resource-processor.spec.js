'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const resourceProcessor = require('../lib/resource-processor');

describe('resource-processor', () => {
    it('should be an object', () => {
        assert.equal(typeof resourceProcessor, 'function');
    });
});

'use strict';

const { expect } = require('chai');

const resourceProcessor = require('../lib/resource-processor');

describe('resource-processor', () => {
    it('should be an object', () => {
        expect(resourceProcessor).to.be.a('function');
    });
});

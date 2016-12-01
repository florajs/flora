'use strict';

const path = require('path');

const { expect } = require('chai');
const bunyan = require('bunyan');

const Master = require('../lib/master');

describe('Master', () => {
    it('should be a function', () => {
        expect(Master).to.be.a('function');
    });

    it('should be instantiable', () => {
        expect(new Master(path.join(__dirname, 'fixtures', 'master-config.js'))).to.be.an('object');
    });

    it('should allow to register plugins', () => {
        const plugin = {
            register: (/* master, options */) => {}
        };

        const master = new Master(path.join(__dirname, 'fixtures', 'master-config.js'));
        master.register(plugin);
    });
});

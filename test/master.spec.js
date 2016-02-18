'use strict';

var expect = require('chai').expect;
var bunyan = require('bunyan');
var path = require('path');
var Master = require('../lib/master');

describe('Master', function () {
    it('should be a function', function () {
        expect(Master).to.be.a('function');
    });

    it('should be instantiable', function () {
        expect(new Master(path.join(__dirname, 'fixtures', 'master-config.js'))).to.be.an('object');
    });

    it('should allow to register plugins', function () {
        var plugin = {
            register: function (master, options) {}
        };

        var master = new Master(path.join(__dirname, 'fixtures', 'master-config.js'));
        master.register(plugin);
    });
});

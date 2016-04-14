'use strict';

var initCalled = 0;

module.exports = function (api) {
    initCalled = 0;

    return {
        _initCalled: function () {
            return initCalled;
        },

        extensions: {
            init: function () {
                initCalled++;
            },

            item: function (ev) {
                ev.item.bar = 'baz';
            },

            preExecute: function (ev) {
                ev.floraRequest._preExecuteArgs = ev;
            },

            postExecute: function (ev) {
                ev.floraRequest._postExecuteArgs = ev;
            }
        },

        actions: {
            retrieve: function (request, response) {
                return api.resourceProcessor.handle(request, response);
            }
        }
    };
};

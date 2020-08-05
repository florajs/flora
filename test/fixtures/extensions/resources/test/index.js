'use strict';

let initCalled = 0;

module.exports = (api) => {
    initCalled = 0;

    return {
        _initCalled: () => {
            return initCalled;
        },

        extensions: {
            init: () => {
                initCalled++;
            },

            item: (ev) => {
                ev.item.bar = 'baz';
            },

            preExecute: (ev) => {
                ev.floraRequest._preExecuteArgs = ev;
            },

            postExecute: (ev) => {
                ev.floraRequest._postExecuteArgs = ev;
            }
        },

        actions: {
            retrieve: (request, response) => {
                return api.resourceProcessor.handle(request, response);
            }
        }
    };
};

'use strict';

module.exports = function (api) {
    return {
        extensions: {
            item: function (ev) {
                ev.item.bar = 'baz';
            },

            preExecute: function (ev) {
                ev.request._preExecuteArgs = ev;
            },

            postExecute: function (ev) {
                ev.request._postExecuteArgs = ev;
            }
        },

        actions: {
            retrieve: function (request, response) {
                return api.resourceProcessor.handle(request, response);
            }
        }
    };
};

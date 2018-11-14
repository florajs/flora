'use strict';

module.exports = (api) => ({
    extensions: {
        // "init" extension
        // is called once upon startup, when all resources are initialized
        init: async function () {
            api.log.info('Extension: resource init');
        },

        // "request" extension
        request: async function (ev) {
            var request = ev.request;
            api.log.info('Extension: resource request');
        },

        // "item" extension
        // is called for every item that is handled by the resource-processor, also when the
        // resource is called as sub-resource from another resource.
        item: function (ev) {
            var request = ev.request;
            var item = ev.item;
            api.log.info('Extension: resource item');
            item.bar = 'baz';
        },

        // "preExecute" extension
        // is called after the request-resolver has resolved the dataSourceTree.
        preExecute: async function (ev) {
            var request = ev.request;
            var dataSourceTree = ev.dataSourceTree;
            api.log.info('Extension: resource preExecute');
        },

        // "postExecute" extension
        // is called after the request has been executed and before the response is being built
        postExecute: async function (ev) {
            var request = ev.request;
            var rawResults = ev.rawResults;
            api.log.info('Extension: resource postExecute');
        },

        // "response" extension
        response: function (ev) {
            var request = ev.request;
            var response = ev.response;
            api.log.info('Extension: resource response');
        }
    },

    actions: {
        retrieve: function (request, response) {
            return api.resourceProcessor.handle(request, response);
        }
    }
});

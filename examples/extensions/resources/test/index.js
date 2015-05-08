'use strict';

module.exports = function (api) {
    return {
        extensions: {
            // "request" extension
            request: function (ev) {
                var request = ev.request;
                console.log('Extension: request (resource scope)');
            },

            // "item" extension
            // is called for every item that is handled by the resource-processor, also when the
            // resource is called as sub-resource from another resource.
            item: function (ev) {
                var request = ev.request;
                var item = ev.item;
                console.log('Extension: item (resource scope)');
                item.bar = 'baz';
            },

            // "preExecute" extension
            // is called after the request-resolver has resolved the dataSourceTree.
            preExecute: function (ev) {
                var request = ev.request;
                var dataSourceTree = ev.dataSourceTree;
                console.log('Extension: preExecute (resource scope)');
            },

            // "postExecute" extension
            // is called after the request has been executed and before the response is being built
            postExecute: function (ev) {
                var request = ev.request;
                var rawResults = ev.rawResults;
                console.log('Extension: postExecute (resource scope)');
            },

            // "response" extension
            response: function (ev) {
                var request = ev.request;
                var response = ev.response;
                console.log('Extension: response (resource scope)');
            }
        },

        actions: {
            retrieve: function (request, response) {
                return api.resourceProcessor.handle(request, response);
            }
        }
    };
};

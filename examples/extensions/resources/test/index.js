'use strict';

module.exports = function (api) {
    return {
        extensions: {
            // "item" extension
            // is called for every item that is handled by the resource-processor, also when the
            // resource is called as sub-resource from another resource.
            item: function (item) {
                console.log('Extension: item (resource scope)');
                item.bar = 'baz';
            },

            // "preExecute" extension
            // is called after the request-resolver has resolved the dataSourceTree.
            preExecute: function (dataSourceTree) {
                console.log('Extension: preExecute (resource scope)');
            },

            // "postExecute" extension
            // is called after the request has been executed and before the response is being built
            postExecute: function (rawResults) {
                console.log('Extension: postExecute (resource scope)');
            }
        },

        actions: {
            retrieve: function (request, response) {
                return api.resourceProcessor.handle(request, response);
            }
        }
    };
};

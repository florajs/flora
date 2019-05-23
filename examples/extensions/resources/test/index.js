'use strict';

module.exports = api => ({
    extensions: {
        // Extension: "init"
        // is called once upon startup, when all resources are initialized
        init: async function() {
            api.log.info('Extension: resource init');
        },

        // Extension: "request"
        request: async function(/* { request, response } */) {
            api.log.info('Extension: resource request');
        },

        // Extension: "item"
        // is called for every item that is handled by the resource-processor, also when the
        // resource is called as sub-resource from another resource.
        item: function({ item /* , row, secondaryRows, request, getAttribute, getResult, buildItem */ }) {
            api.log.info('Extension: resource item');
            item.bar = 'baz';
        },

        // Extension: "preExecute"
        // is called after the request-resolver has resolved the dataSourceTree.
        preExecute: async function(/* { request, dataSourceTree, floraRequest } */) {
            api.log.info('Extension: resource preExecute');
        },

        // Extension: "postExecute"
        // is called after the request has been executed and before the response is being built
        postExecute: async function(/* { request, floraRequest, rawResults } */) {
            api.log.info('Extension: resource postExecute');
        },

        // Extension: "preExecute" / "postExecute"
        // when having more data-sources than just "primary" you can reference them individually:
        preExecute_or_postExecute: {
            primary: async function(/* { request, dataSourceTree, floraRequest } */) {
                api.log.info('Extension: resource preExecute for "primary" data-source');
            },
            fulltextSearch: async function(/* { request, dataSourceTree, floraRequest } */) {
                api.log.info('Extension: resource preExecute for "fulltextSearch" data-source');
            }
        },

        // Extension: "response"
        response: function(/* { request, response } */) {
            api.log.info('Extension: resource response');
        },

        // Sub-Resources: for every (inline or included) sub-resource you can define individual extensions.
        // works for: preExecute, postExecute, item
        // if an included sub-resource defines the same extension it is executed first:
        subResources: {
            'addresses.country': {
                preExecute: async function(/* { request, dataSourceTree, floraRequest } */) {
                    api.log.info('Extension: resource preExecute');
                }
            }
        }
    },

    actions: {
        retrieve: function(request, response) {
            return api.resourceProcessor.handle(request, response);
        }
    }
});

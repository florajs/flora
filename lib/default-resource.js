'use strict';

/**
 * Default resource.
 *
 * The default resource only implements the "retrieve" action and calls
 * the resource processor.
 *
 * @param {Api} api
 * @return {Object} resource instance
 */
module.exports = function defautResource(api) {
    return {
        actions: {
            /**
             * @param {Request} request
             * @param {Response} response
             */
            retrieve: (request, response) => api.resourceProcessor.handle(request, response)
        }
    };
};

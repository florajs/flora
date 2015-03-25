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
module.exports = function (api) {
    return {
        actions: {

            /**
             * @param {Request} request
             * @param {Response} response
             */
            retrieve: function (request, response) {
                return api.resourceProcessor.handle(request, response);
            }
        }
    };
};

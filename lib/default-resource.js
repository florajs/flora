'use strict';

/**
 * Default resource.
 *
 * The default resource only implements the "retrieve" action and calls
 * the resource processor.
 *
 * @param {Api} api
 * @return {Object}
 */
module.exports = api => ({
    actions: {
        /**
         * @param {Request} request
         * @param {Response} response
         * @returns {Promise<Object>}
         */
        retrieve: (request, response) => api.resourceProcessor.handle(request, response)
    }
});

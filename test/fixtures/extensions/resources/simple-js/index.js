'use strict';

module.exports = (/* api */) => ({
    actions: {
        retrieve: () => ({ called: 'retrieve-default' }),
        retrieveAsync: () => Promise.resolve({ called: 'retrieveAsync-default' }),
        formats: {
            default: () => ({ called: 'formats-default' }),
            image: () => ({ called: 'formats-image' })
        }
    }
});

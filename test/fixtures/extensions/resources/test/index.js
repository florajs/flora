'use strict';

module.exports = function (api) {
    return {
        extensions: {
            item: function (ev) {
                ev.item.bar = 'baz';
            }
        },

        actions: {
            retrieve: function (request, response) {
                return api.resourceProcessor.handle(request, response);
            }
        }
    };
};

'use strict';

module.exports = function (api) {
    return {
        extensions: {
            // "item" extension
            // is called for every item that is handled by the resource-processor, also when the
            // resource is called as sub-resource from another resource.
            item: function (item) {
                console.log('item');
                item.bar = 'baz';
            }
        },

        actions: {
            retrieve: function (request, response) {
                return api.resourceProcessor.handle(request, response);
            }
        }
    };
};

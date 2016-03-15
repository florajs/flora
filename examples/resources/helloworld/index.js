'use strict';

module.exports = function (api) {
    return {
        actions: {
            hello: function (request, response) {
                response.send('Hello World');
            }
        }
    };
};

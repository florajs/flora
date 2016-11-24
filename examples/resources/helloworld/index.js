'use strict';

module.exports = (api) => {
    return {
        actions: {
            hello: (request, response) => {
                response.send('Hello World');
            }
        }
    };
};

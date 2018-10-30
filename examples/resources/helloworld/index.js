'use strict';

module.exports = (api) => ({
    actions: {
        hello: (request, response) => {
            response.send('Hello World');
        }
    }
});

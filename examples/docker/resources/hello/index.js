module.exports = (/* api */) => {
    return {
        actions: {
            retrieve: (request, response) => response.send('Hello World'),
            callMe: (request, response) => {
                const name = request.myName || 'stranger';
                response.send(`Hello ${name}!`);
            }
        }
    };
};

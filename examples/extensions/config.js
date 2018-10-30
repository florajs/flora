const path = require('path');

const emptyDataSource = () => ({
    process: (request, callback) => {
        callback(null, {
            data: [{
                id: 1,
                foo: 'bar'
            }],
            totalCount: null
        });
    },
    prepare: () => {}
});

module.exports = {
    resourcesPath: path.join(__dirname, 'resources'),
    port: 8000,
    dataSources: {
        empty: {
            constructor: emptyDataSource
        }
    }
};

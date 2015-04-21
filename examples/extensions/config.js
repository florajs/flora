var path = require('path');

var emptyDataSource = function () {
    return {
        process: function (request, callback) {
            callback(null, {
                data: [{
                    id: 1,
                    foo: 'bar'
                }],
                totalCount: null
            });
        },
        prepare: function () {}
    };
};

module.exports = {
    resourcesPath: path.join(__dirname, 'resources'),
    port: 8000,
    dataSources: {
        empty: {
            constructor: emptyDataSource
        }
    }
};

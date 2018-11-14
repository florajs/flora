const path = require('path');

class EmptyDataSource {
    async process(request) {
        return {
            data: [{
                id: 1,
                foo: 'bar'
            }],
            totalCount: null
        };
    }

    prepare() {}
}

module.exports = {
    resourcesPath: path.join(__dirname, 'resources'),
    port: 3000,
    dataSources: {
        empty: {
            constructor: EmptyDataSource
        }
    }
};

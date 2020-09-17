const path = require('path');

module.exports = {
    resourcesPath: path.join(__dirname, 'resources'),

    port: 8000,
    exposeErrors: true,
    allowExplain: true,

    dataSources: {
        mysql: {
            constructor: require('flora-mysql'),
            options: {
                servers: {
                    default: {
                        user: 'dbuser',
                        password: 'dbpassword',
                        host: 'dbhost'
                    }
                }
            }
        }
    }
};

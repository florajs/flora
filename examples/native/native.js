const path = require('path');
const flora = require('flora');

/*
 * Make native calls to a Flora API without using HTTP
 */

const api = new flora.Api();

const config = {
    resourcesPath: path.join(__dirname, 'resources'),
    dataSources: {
        mysql: {
            constructor: require('@florajs/datasource-mysql'),
            options: {
                server: {
                    host: 'localhost',
                    user: 'dbuser',
                    password: 'dbpassword'
                }
            }
        }
    }
};

const request = new flora.Request({
    resource: 'test',
    select: 'select=iso2,iso3,currency(order=iso:desc).iso'
});

api.init(config)
    .then(() => api.execute(request))
    .then((response) => console.log(response)); // eslint-disable-line no-console

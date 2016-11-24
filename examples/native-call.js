'use strict';

const path = require('path');
const flora = require('../');

const api = new flora.Api();

const config = {
    resourcesPath: path.join(__dirname, 'resources'),
    dataSources: {
        mysql: {
            constructor: require('flora-mysql'),
            options: {
                server: {
                    host: 'localhost',
                    user: 'root',
                    password: 'secret'
                }
            }
        }
    }
};

const request = new flora.Request({
    resource: 'test',
    select: 'select=iso2,iso3,currency(order=iso:desc).iso'
});

api.init(config, (err) => {
    if (err) return;
    api.execute(request, (e, response) => {
        if (e) return;
        console.log(response);
    });
});

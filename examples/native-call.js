'use strict';

var path = require('path');
var flora = require('../');

var api = new flora.Api();

var config = {
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

var request = new flora.Request({
    resource: 'test',
    select: 'select=iso2,iso3,currency(order=iso:desc).iso'
});

api.init(config, function (err) {
    if (err) return;
    api.execute(request, function onFloraResponse(e, response) {
        if (e) return;
        console.log(response);
    });
});

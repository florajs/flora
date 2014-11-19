'use strict';

var Benchmark = require('benchmark');

var requestParser = require('../lib/request-parser');

var parsers = {
    'id': require('../lib/request-parser/id'),
    'aggregate': require('../lib/request-parser/aggregate'),
    'filter': require('../lib/request-parser/filter'),
    'limit': require('../lib/request-parser/limit'),
    'order': require('../lib/request-parser/order'),
    'page': require('../lib/request-parser/page'),
    'search': require('../lib/request-parser/search'),
    'select': require('../lib/request-parser/select')
};

var suite = new Benchmark.Suite();

suite.add('request', function () {
    requestParser({
        id: 133962,
        select: 'title,author.id,instruments[name,indentifiers[wkn,isin]]',
        filter: 'author.id=1337',
        order: 'instruments.name:asc',
        limit: 10,
        page: 1
    });
});

suite.add('id', function () {
    parsers.id(133962);
});

suite.add('filter', function () {
    parsers.filter('type.id=1 AND categories.id=2');
});

suite.add('limit', function () {
    parsers.limit(100);
});

suite.add('order', function () {
    parsers.order('name:asc');
});

suite.add('page', function () {
    parsers.page(1);
});

suite.add('select', function () {
    parsers.select('title,author.id,instruments[name,indentifiers[wkn,isin]]');
});

suite.on('cycle', function (event) {
    console.log(String(event.target));
});

suite.run({async: true});

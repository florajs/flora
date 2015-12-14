'use strict';

var expect = require('chai').expect;

var requestParser = require('../lib/request-parser');
var aggregateParser = require('../lib/request-parser/aggregate');
var filterParser = require('../lib/request-parser/filter');
var idParser = require('../lib/request-parser/id');
var limitParser = require('../lib/request-parser/limit');
var orderParser = require('../lib/request-parser/order');
var pageParser = require('../lib/request-parser/page');
var searchParser = require('../lib/request-parser/search');
var selectParser = require('../lib/request-parser/select');

describe('request-parser', function () {
    describe('main parser', function () {
        it('should be a function', function () {
            expect(requestParser).to.be.a('function');
        });

        it('throws an error if parameter is not an object', function () {
            expect((function () { requestParser(); })).to.throw(Error);
            expect((function () { requestParser(42); })).to.throw(Error);
            expect((function () { requestParser("foo"); })).to.throw(Error);
        });

        it('should return an object', function () {
            expect(requestParser({})).to.be.an('object');
        });

        it('accepts and passes through unknown properties', function () {
            expect(requestParser({"foo": "bar"})).to.eql({"foo": "bar"});
        });

        describe('id', function () {
            it('should parse "id" property', function () {
                var parsed = requestParser({"id": 42});
                expect(parsed).to.be.an('object');
            });
        });

        describe('aggregate', function () {
            it('is not implemented', function () {
                expect((function () { requestParser({"aggregate": {}}); })).to.throw(Error);
            });
        });

        describe('limit', function () {
            it('should parse "limit" property', function () {
                var parsed = requestParser({"limit": 42});
                expect(parsed).to.be.an('object');
            });

            it('throws an error if "limit" is invalid', function () {
                expect((function () { requestParser({"limit": "foo"}); })).to.throw(Error);
            });
        });

        describe('page', function () {
            it('should parse "page" property', function () {
                var parsed = requestParser({"page": 42});
                expect(parsed).to.be.an('object');
            });

            it('throws an error if "page" is invalid', function () {
                expect((function () { requestParser({"page": "foo"}); })).to.throw(Error);
            });
        });

        describe('order', function () {
            it('should parse "order" property', function () {
                var parsed = requestParser({"order": "name:asc"});
                expect(parsed).to.be.an('object');
            });

            it('throws an error if "order" is invalid', function () {
                expect((function () { requestParser({"order": 42}); })).to.throw(Error);
            });
        });

        describe('search', function () {
            it('should parse "order" property', function () {
                var parsed = requestParser({"search": "foo"});
                expect(parsed).to.be.an('object');
            });
        });

        describe('select', function () {
            it('should parse "select" property', function () {
                var parsed = requestParser({"select": "title,instruments.id,quote[countryId]"});
                expect(parsed).to.be.an('object');
            });

            it('throws an error if "select" is invalid', function () {
                expect((function () { requestParser({"select": 42}); })).to.throw(Error);
                expect((function () { requestParser({"select": ""}); })).to.throw(Error);
                expect((function () { requestParser({"select": {foo: "bar"}}); })).to.throw(Error);
            });
        });

        describe('filter', function () {
            it('should parse "filter" property', function () {
                var parsed = requestParser({"filter": "type.id=1"});
                expect(parsed).to.be.an('object');
            });

            it('throws an error if "filter" is invalid', function () {
                expect((function () { requestParser({"filter": 42}); })).to.throw(Error);
                expect((function () { requestParser({"filter": ""}); })).to.throw(Error);
                expect((function () { requestParser({"filter": {foo: "bar"}}); })).to.throw(Error);
            });
        });
    });

    describe('aggregate parser', function () {
        it('should be a function', function () {
            expect(aggregateParser).to.be.a('function');
        });

        it('should throw an error (not implemented)', function () {
            expect((function () { aggregateParser({}); })).to.throw(Error);
        });
    });

    describe('filter parser', function () {
        it('should be a function', function () {
            expect(filterParser).to.be.a('function');
        });

        it('should throw an error for non-string arguments', function () {
            expect((function () { filterParser(1); })).to.throw(Error);
            expect((function () { filterParser({}); })).to.throw(Error);
            expect((function () { filterParser([]); })).to.throw(Error);
        });

        it('does not accept empty strings', function () {
            expect((function () { filterParser(''); })).to.throw(Error);
        });

        describe('filter by single attribute', function () {
            it('accepts single filter parameters', function () {
                expect((function () { filterParser('type.id=1'); })).not.to.throw(Error);
            });

            it('parses single attributes', function () {
                expect(filterParser('id=1')).to.eql([
                    [{attribute: ['id'], operator: 'equal', value: 1}]
                ]);
            });

            it('parses single composite attributes (resolves attribute)', function () {
                expect(filterParser('type.id=1')).to.eql([
                    [{attribute: ['type', 'id'], operator: 'equal', value: 1}]
                ]);
            });
        });

        describe('multiple values', function () {
            it('accepts multiple values with ","', function () {
                expect((function () { filterParser('type.id=1,2,3'); })).not.to.throw(Error);
            });

            it('parses into arrays', function () {
                expect(filterParser('type.id=1,2,3')).to.eql([
                    [{attribute: ['type', 'id'], operator: 'equal', value: [1, 2, 3]}]
                ]);
            });
        });

        describe('multiple attributes with "AND"', function () {
            it('accepts AND syntax', function () {
                expect((function () { filterParser('type.id=1 AND categories.id=2'); })).not.to.throw(Error);
            });

            it('parses into top-level array', function () {
                expect(filterParser('type.id=1 AND categories.id=2')).to.eql([
                    [
                        {attribute: ['type', 'id'], operator: 'equal', value: 1},
                        {attribute: ['categories', 'id'], operator: 'equal', value: 2}
                    ]
                ]);
            });
        });

        describe('multiple attributes with "OR"', function () {
            it('accepts OR syntax', function () {
                expect((function () { filterParser('type.id=1 OR categories.id=2'); })).not.to.throw(Error);
            });

            it('parses into second-level array', function () {
                expect(filterParser('type.id=1 OR categories.id=2')).to.eql([
                    [{attribute: ['type', 'id'], operator: 'equal', value: 1}],
                    [{attribute: ['categories', 'id'], operator: 'equal', value: 2}]
                ]);
            });

            it('parses into second-level array (multiple values)', function () {
                expect(filterParser('type.id=1,2,3 OR categories.id=2,65')).to.eql([
                    [{attribute: ['type', 'id'], operator: 'equal', value: [1, 2, 3]}],
                    [{attribute: ['categories', 'id'], operator: 'equal', value: [2, 65]}]
                ]);
            });
        });

        describe('multiple attributes, AND and OR', function () {
            it('resolves AND-precedence', function () {
                expect(filterParser('(type.id=1 OR countries.id=3) AND categories.id=2')).to.eql([
                    [
                        {attribute: ['type', 'id'], operator: 'equal', value: 1},
                        {attribute: ['categories', 'id'], operator: 'equal', value: 2}
                    ],
                    [
                        {attribute: ['countries', 'id'], operator: 'equal', value: 3},
                        {attribute: ['categories', 'id'], operator: 'equal', value: 2}
                    ]
                ]);
            });

            it('resolves AND-precedence (multiple values)', function () {
                expect(filterParser('(type.id=1,2,3 OR countries.id=3,23) AND categories.id=2,65')).to.eql([
                    [
                        {attribute: ['type', 'id'], operator: 'equal', value: [1, 2, 3]},
                        {attribute: ['categories', 'id'], operator: 'equal', value: [2, 65]}
                    ],
                    [
                        {attribute: ['countries', 'id'], operator: 'equal', value: [3, 23]},
                        {attribute: ['categories', 'id'], operator: 'equal', value: [2, 65]}
                    ]
                ]);
            });
        });

        describe('attribute paths', function () {
            it('allowes square brackets', function () {
                expect(filterParser('author.group[isPremium=true AND package.price>=10]')).to.eql([
                    [
                        {attribute: ['author', 'group', 'isPremium'], operator: 'equal', value: true},
                        {attribute: ['author', 'group', 'package', 'price'], operator: 'greaterOrEqual', value: 10}
                    ]
                ]);
            });

            it('converts short syntax (AND)', function () {
                expect(filterParser('author.group[isPremium AND active]=true')).to.eql([
                    [
                        {attribute: ['author', 'group', 'isPremium'], operator: 'equal', value: true},
                        {attribute: ['author', 'group', 'active'], operator: 'equal', value: true}
                    ]
                ]);
            });

            it('converts short syntax (OR)', function () {
                expect(filterParser('instrument[stock OR currency].active=true')).to.eql([
                    [{attribute: ['instrument', 'stock', 'active'], operator: 'equal', value: true}],
                    [{attribute: ['instrument', 'currency', 'active'], operator: 'equal', value: true}]
                ]);
            });

            it('converts short syntax (OR and AND)', function () {
                expect(filterParser('instrument[stock OR currency][active AND isPublic]=true')).to.eql([
                    [
                        {attribute: ['instrument', 'stock', 'active'], operator: 'equal', value: true},
                        {attribute: ['instrument', 'stock', 'isPublic'], operator: 'equal', value: true}
                    ],
                    [
                        {attribute: ['instrument', 'currency', 'active'], operator: 'equal', value: true},
                        {attribute: ['instrument', 'currency', 'isPublic'], operator: 'equal', value: true}
                    ]
                ]);
            });
        });

        describe('operators', function () {
            it('equal', function () {
                expect((filterParser('equal=1'))[0][0].operator).to.equal('equal');
            });

            it('notEqual', function () {
                expect((filterParser('equal!=1'))[0][0].operator).to.equal('notEqual');
            });

            it('greater', function () {
                expect((filterParser('equal>1'))[0][0].operator).to.equal('greater');
            });

            it('greaterOrEqual', function () {
                expect((filterParser('equal>=1'))[0][0].operator).to.equal('greaterOrEqual');
            });

            it('less', function () {
                expect((filterParser('equal<1'))[0][0].operator).to.equal('less');
            });

            it('lessOrEqual', function () {
                expect((filterParser('equal<=1'))[0][0].operator).to.equal('lessOrEqual');
            });
        });

        describe('data types', function () {
            it('int', function () {
                expect((filterParser('foo=0'))[0][0].value).to.be.a('number');
                expect((filterParser('foo=1'))[0][0].value).to.be.a('number');
            });

            it('float', function () {
                expect((filterParser('foo=0.0'))[0][0].value).to.be.a('number');
                expect((filterParser('foo=3.1415'))[0][0].value).to.be.a('number');
            });

            it('boolean', function () {
                expect((filterParser('foo=true'))[0][0].value).to.equal(true);
                expect((filterParser('foo=false'))[0][0].value).to.equal(false);
            });

            it('string', function () {
                expect((filterParser('foo="bar"'))[0][0].value).to.be.a('string');
                expect((filterParser('foo="bar\\"baz"'))[0][0].value).to.be.a('string');
                expect((filterParser('foo=""'))[0][0].value).to.be.a('string');
            });

            it('null', function () {
                expect((filterParser('foo=null'))[0][0].value).to.equal(null);
            });

            it('null is case sensitive', function () {
                expect((function () { filterParser('foo=Null'); })).to.throw(Error);
                expect((function () { filterParser('foo=NULL'); })).to.throw(Error);
            });
        });

        describe('complex examples', function () {
            it('parses "type.id=1 AND author.id=30 AND isPremium=false OR categories.id=20 OR title="DAX Tagesausblick""', function () {
                expect(filterParser('type.id=1 AND author.id=30 AND isPremium=false OR categories.id=20 OR title="DAX Tagesausblick"')).to.eql([
                    [
                        {attribute: ['type', 'id'], operator: 'equal', value: 1},
                        {attribute: ['author', 'id'], operator: 'equal', value: 30},
                        {attribute: ['isPremium'], operator: 'equal', value: false},
                    ],
                    [
                        {attribute: ['categories', 'id'], operator: 'equal', value: 20}
                    ],
                    [
                        {attribute: ['title'], operator: 'equal', value: "DAX Tagesausblick"}
                    ]
                ]);
            });

            it('parses "type.id=1 AND author.id=30 AND isPremium=false OR categories.id=20,65 OR title="DAX Tagesausblick""', function () {
                expect(filterParser('type.id=1 AND author.id=30 AND isPremium=false OR categories.id=20,65 OR title="DAX Tagesausblick"')).to.eql([
                    [
                        {attribute: ['type', 'id'], operator: 'equal', value: 1},
                        {attribute: ['author', 'id'], operator: 'equal', value: 30},
                        {attribute: ['isPremium'], operator: 'equal', value: false},
                    ],
                    [
                        {attribute: ['categories', 'id'], operator: 'equal', value: [20, 65]}
                    ],
                    [
                        {attribute: ['title'], operator: 'equal', value: "DAX Tagesausblick"}
                    ]
                ]);
            });
        });
    });

    describe('id parser', function () {
        it('should be a function', function () {
            expect(idParser).to.be.a('function');
        });

        it('should return the input as string', function () {
            expect(idParser(1)).to.be.a('string');
            expect(idParser(1)).to.equal("1");
            expect(idParser(3.1415)).to.equal("3.1415");
            expect(idParser("foo")).to.equal("foo");
        });

        it('should only accept string or number', function () {
            expect(function () { idParser(1); }).not.to.throw(Error);
            expect(function () { idParser(3.1415); }).not.to.throw(Error);
            expect(function () { idParser("foo"); }).not.to.throw(Error);
            expect(function () { idParser([]); }).to.throw(Error);
            expect(function () { idParser({}); }).to.throw(Error);
            expect(function () { idParser(); }).to.throw(Error);
        });
    });

    describe('limit parser', function () {
        it('should be a function', function () {
            expect(limitParser).to.be.a('function');
        });

        it('should return a number', function () {
            expect(limitParser(1)).to.be.a('number');
            expect(limitParser(1234)).to.equal(1234);
        });

        it('should accept number strings and convert them', function () {
            expect(limitParser("1")).to.be.a('number');
            expect(limitParser("1234")).to.equal(1234);
        });

        it('should return null for "unlimited"', function () {
            expect(limitParser("unlimited")).to.equal(null);
        });

        it('should throw an error for non-number strings', function () {
            expect((function () { limitParser("foo"); })).to.throw(Error);
            expect((function () { limitParser({}); })).to.throw(Error);
            expect((function () { limitParser([]); })).to.throw(Error);
        });

        it('should throw an error for numbers < 1', function () {
            expect((function () { limitParser(0); })).to.throw(Error);
            expect((function () { limitParser("0"); })).to.throw(Error);
            expect((function () { limitParser(-1); })).to.throw(Error);
            expect((function () { limitParser(-100); })).to.throw(Error);
        });
    });

    describe('order-parser', function () {
        it('should be a function', function () {
            expect(orderParser).to.be.a('function');
        });

        it('should throw an error for non-string arguments', function () {
            expect((function () { orderParser(1); })).to.throw(Error);
            expect((function () { orderParser({}); })).to.throw(Error);
            expect((function () { orderParser([]); })).to.throw(Error);
        });

        it('does not accept empty strings', function () {
            expect((function () { orderParser(''); })).to.throw(Error);
            expect((function () { orderParser(','); })).to.throw(Error);
        });

        it('accepts single order parameters', function () {
            expect((function () { orderParser('name:asc'); })).not.to.throw(Error);
        });

        it('accepts multiple order parameters', function () {
            expect((function () { orderParser('name:asc,type:desc'); })).not.to.throw(Error);
        });

        it('should throw an error for invalid order parameters', function () {
            expect((function () { orderParser('foo'); })).to.throw(Error);
            expect((function () { orderParser('name:asc,type'); })).to.throw(Error);
            expect((function () { orderParser('name:asc:foo'); })).to.throw(Error);
        });

        it('should throw an error for invalid order directions', function () {
            expect((function () { orderParser('name:as'); })).to.throw(Error);
            expect((function () { orderParser('name:ASC'); })).to.throw(Error);
        });

        describe('"random" direction', function () {
            it('should be the only order element', function () {
                expect((function () { orderParser(':random'); })).not.to.throw(Error);
                expect((function () { orderParser('name:asc,:random'); })).to.throw(Error);
            });

            it('should have no attribute', function () {
                expect((function () { orderParser('name:random'); })).to.throw(Error);
            });
        });

        describe('single order parameters', function () {
            var o = orderParser('name:asc');

            it('should transform the argument into an array', function () {
                expect(o).to.be.an('array');
                expect(o).to.have.length(1);
            });

            it('should return an array of objects', function () {
                expect(o[0]).to.be.an('object');
                expect(o[0]).to.have.ownProperty('attribute');
                expect(o[0]).to.have.ownProperty('direction');
                expect(o[0].attribute).to.be.an('array');
                expect(o[0].attribute[0]).to.equal('name');
                expect(o[0].direction).to.equal('asc');
            });
        });

        describe('multiple order parameters', function () {
            var o = orderParser('foo:asc,bar:desc');

            it('should transform the argument into an array', function () {
                expect(o).to.be.an('array');
                expect(o).to.have.length(2);
            });

            it('should return an array of objects', function () {
                expect(o[0]).to.be.an('object');
                expect(o[0]).to.have.ownProperty('attribute');
                expect(o[0]).to.have.ownProperty('direction');
                expect(o[0].attribute).to.be.an('array');
                expect(o[0].attribute[0]).to.equal('foo');
                expect(o[0].direction).to.equal('asc');

                expect(o[1]).to.be.an('object');
                expect(o[1]).to.have.ownProperty('attribute');
                expect(o[1]).to.have.ownProperty('direction');
                expect(o[1].attribute).to.be.an('array');
                expect(o[1].attribute[0]).to.equal('bar');
                expect(o[1].direction).to.equal('desc');
            });
        });

        describe('nested attibutes', function () {
            var o = orderParser('instrument.id:asc');

            it('should transform the argument into an array', function () {
                expect(o).to.be.an('array');
                expect(o).to.have.length(1);
            });

            it('should return an array of objects', function () {
                expect(o[0]).to.be.an('object');
                expect(o[0]).to.have.ownProperty('attribute');
                expect(o[0]).to.have.ownProperty('direction');
                expect(o[0].attribute).to.be.an('array');
                expect(o[0].attribute[0]).to.equal('instrument');
                expect(o[0].attribute[1]).to.equal('id');
                expect(o[0].direction).to.equal('asc');
            });
        });
    });

    describe('page-parser', function () {
        it('should be a function', function () {
            expect(pageParser).to.be.a('function');
        });

        it('should return a number', function () {
            expect(pageParser(1)).to.be.a('number');
            expect(pageParser(1234)).to.equal(1234);
        });

        it('should accept number strings and convert them', function () {
            expect(pageParser("1")).to.be.a('number');
            expect(pageParser("1234")).to.equal(1234);
        });

        it('should return 1 for undefined', function () {
            var output = pageParser();
            expect(output).to.be.a('number');
            expect(output).to.equal(1);
        });

        it('should throw an error for non-number strings', function () {
            expect((function () { pageParser("foo"); })).to.throw(Error);
            expect((function () { pageParser({}); })).to.throw(Error);
            expect((function () { pageParser([]); })).to.throw(Error);
        });

        it('should throw an error for numbers < 1', function () {
            expect((function () { pageParser(0); })).to.throw(Error);
            expect((function () { pageParser("0"); })).to.throw(Error);
            expect((function () { pageParser(-1); })).to.throw(Error);
            expect((function () { pageParser(-100); })).to.throw(Error);
        });
    });

    describe('search-parser', function () {
        it('should be a function', function () {
            expect(searchParser).to.be.a('function');
        });

        it('should return a string', function () {
            expect(searchParser("foo")).to.be.a('string');
            expect(searchParser(1234)).to.be.a('string');
        });

        it('should accept strings and convert them', function () {
            expect(searchParser("1")).to.be.a('string');
            expect(searchParser(1234)).to.equal("1234");
        });

        it('should not modify strings', function () {
            expect(searchParser("foo bar")).to.equal("foo bar");
        });

        it('should return undefined for undefined', function () {
            expect(searchParser()).to.equal(undefined);
        });

        it('should throw an error for non-strings', function () {
            expect((function () { searchParser({}); })).to.throw(Error);
            expect((function () { searchParser([]); })).to.throw(Error);
        });
    });

    describe('select-parser', function () {
        it('should be a function', function () {
            expect(selectParser).to.be.a('function');
        });

        it('should throw an error for non-string arguments', function () {
            expect((function () { selectParser(1); })).to.throw(Error);
            expect((function () { selectParser({}); })).to.throw(Error);
            expect((function () { selectParser([]); })).to.throw(Error);
        });

        it('does not accept empty strings', function () {
            expect((function () { selectParser(''); })).to.throw(Error);
            expect((function () { selectParser(','); })).to.throw(Error);
        });

        it('accepts single select parameters', function () {
            expect((function () { selectParser('title'); })).not.to.throw(Error);
        });

        it('accepts multiple select parameters', function () {
            expect((function () { selectParser('title,instruments'); })).not.to.throw(Error);
        });

        describe('attributes without parameters', function () {
            it('returns the parts as object keys', function () {
                expect(selectParser('foo')).to.eql({foo: {}});

            });

            it('works for multiple parts', function () {
                expect(selectParser('foo,bar')).to.eql({foo: {}, bar: {}});
            });
        });

        describe('single attributes with parameters', function () {
            it('parses single parameters', function () {
                expect(selectParser('foo(limit=3)')).to.eql({foo: {limit: 3}});
                expect(selectParser('foo(order=name:asc)')).to.eql({
                    foo: {order: [{direction: "asc", attribute: ["name"]}]}
                });
            });

            it('accepts and passes through unknown parameters', function () {
                expect((function () { selectParser('foo(a=1)'); })).not.to.throw(Error);
            });

            xit('accepts array parameters', function () {
                expect((function () { selectParser('foo(filter=id=1,2)'); })).to.eql({
                    foo: {
                        filter: [{attribute: ['id'], operator: 'equal', value: [1, 2]}]
                    }
                });
            });

            it('does not accept invalid operators', function () {
                expect((function () { selectParser('foo(limit>3)'); })).to.throw(Error);
            });

            it('does not accept invalid parameters', function () {
                expect((function () { selectParser('foo(limit=foo)'); })).to.throw(Error);
            });

            it('parses multiple parameters', function () {
                expect(selectParser('foo(limit=3)(order=name:asc)')).to.eql({
                    foo: {
                        order: [{direction: "asc", attribute: ["name"]}],
                        limit: 3,
                    }
                });
            });
        });

        describe('multiple attributes with parameters', function () {
            it('parses single parameters', function () {
                expect(selectParser('title,foo(limit=3)')).to.eql({
                    title: {},
                    foo: {limit: 3}
                });
                expect(selectParser('title(page=1),foo(limit=3)')).to.eql({
                    title: {page: 1},
                    foo: {limit: 3}
                });
            });
        });

        describe('attributes with children (brackets)', function () {
            it('fails on empty children "a[]"', function () {
                expect(function () { selectParser('a[]'); }).to.throw(Error);
            });

            it('parses simple children "a[b]"', function () {
                expect(selectParser('a[b]')).to.eql({a: {select: {b: {}}}});
            });

            it('parses nested children "a[b[c]]"', function () {
                expect(selectParser('a[b[c]]')).to.eql({a: {select: {b: {select: {c: {}}}}}});
            });

            it('parses mixed attributes "a[b],c"', function () {
                expect(selectParser('a[b],c')).to.eql({a: {select: {b: {}}}, c: {}});
            });

            it('parses mixed attributes "a[b],c[d]"', function () {
                expect(selectParser('a[b],c[d]')).to.eql({a: {select: {b: {}}}, c: {select: {d: {}}}});
            });

            it('parses multiple children "a[b,c]', function () {
                expect(selectParser('a[b,c]')).to.eql({a: {select: {b: {}, c: {}}}});
            });

            it('parses multiple children "a[b,c[d]]', function () {
                expect(selectParser('a[b,c[d]]')).to.eql({a: {select: {b: {}, c: {select: {d: {}}}}}});
            });

            it('parses multiple children "a[b,c[d,e]]', function () {
                expect(selectParser('a[b,c[d]]')).to.eql({a: {select: {b: {}, c: {select: {d: {}}}}}});
                expect(selectParser('a[b,c[d,e]]')).to.eql({a: {select: {b: {}, c: {select: {d: {}, e: {}}}}}});
            });
        });

        describe('attributes with children (brackets) with parameters', function () {
            it('fails on empty children "a(limit=3)[]"', function () {
                expect(function () { selectParser('a(limit=3)[]'); }).to.throw(Error);
            });

            it('parses simple parameters on root level', function () {
                expect(selectParser('a(limit=3)[b]')).to.eql({a: {limit: 3, select: {b: {}}}});
            });

            it('parses simple parameters on children level', function () {
                expect(selectParser('a[b(limit=3)]')).to.eql({a: {select: {b: {limit: 3}}}});
            });

            it('parses simple parameters on all levels', function () {
                expect(selectParser('a(limit=3)[b(limit=4)]')).to.eql({a: {limit: 3, select: {b: {limit: 4}}}});
            });

            it('parses a complex example', function () {
                expect(selectParser('a(limit=1)[b(limit=2)(limit=3),x[y(limit=4)],zz],z')).to.eql({
                    a: {
                        limit: 1,
                        select: {
                            b: {limit: 3},
                            x: {
                                select: {y: {limit: 4}}
                            },
                            zz: {}
                        }
                    },
                    z: {}
                });
            });
        });

        describe('attributes with children (dot notation)', function () {
            it('parses "a.b"', function () {
                expect(selectParser('a.b')).to.eql({a: {select: {b: {}}}});
            });

            it('parses "a.*"', function () {
                expect(selectParser('a.*')).to.eql({a: {select: {'*': {}}}});
            });

            it('parses children with parameters', function () {
                expect(selectParser('a(limit=3).b')).to.eql({a: {limit: 3, select: {b: {}}}});
                expect(selectParser('a.b(limit=4)')).to.eql({a: {select: {b: {limit: 4}}}});
                expect(selectParser('a(limit=3).b(limit=4)')).to.eql({a: {limit: 3, select: {b: {limit: 4}}}});
            });

            it('fails on duplicate dots', function () {
                expect(function () { selectParser('a..b'); }).to.throw(Error);
            });
        });

        describe('attributes with children (dot and bracket notation)', function () {
            it('parses "a.b,a[c]"', function () {
                expect(selectParser('a.b,a[b,c]')).to.eql({ a: { select: { b: {}, c: {} } } });
            });

            it('parses "a(limit=3).b,a[c]"', function () {
                // FIXME:
                // das zweite "a" ohne Parameter gehört angemeckert,
                // weil eigentlich "limit=3" dafür nicht gilt!
                expect(selectParser('a(limit=3).b,a[c]')).to.eql({ a: { limit: 3, select: { b: {}, c: {} } } });
            });

            it('parses "a.b,a(limit=3)[c]"', function () {
                // FIXME:
                // das "limit=3" gehört angemeckert, weil a schon ohne Limit requested wurde?
                expect(selectParser('a.b,a(limit=3)[c]')).to.eql({ a: { limit: 3, select: { b: {}, c: {} } } });
            });

            // ...
        });

        describe('complex examples', function () {
            it('parses "instruments[stock,index].countryId"', function () {
                expect(selectParser('instruments[stock,index].countryId')).to.eql({
                    instruments: {
                        select: {
                            stock: {select: {countryId: {}}},
                            index: {select: {countryId: {}}}
                        }
                    }
                });
            });

            it('parses "title,instruments(order=name:asc)(limit=3)(page=1).quotations(limit=4).quote"', function () {
                expect(selectParser('title,instruments(order=name:asc)(limit=3)(page=1).quotations(limit=4).quote')).to.eql({
                    title: {},
                    instruments: {
                        order: [{attribute: ['name'], direction: 'asc'}],
                        limit: 3,
                        page: 1,
                        select: {
                            quotations: {
                                limit: 4,
                                select: {
                                    quote: {}
                                }
                            }
                        }
                    }
                });
            });

            it('parses "title,instruments(order=name:asc)(limit=3)(page=1).quotations(limit=4)[quote[value,changePerc]]"', function () {
                expect(selectParser('title,instruments(order=name:asc)(limit=3)(page=1).quotations(limit=4)[quote[value,changePerc]]')).to.eql({
                    title: {},
                    instruments: {
                        order: [{attribute: ['name'], direction: 'asc'}],
                        limit: 3,
                        page: 1,
                        select: {
                            quotations: {
                                limit: 4,
                                select: {
                                    quote: {
                                        select: {
                                            value: {},
                                            changePerc: {}
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            });
        });
    });
});

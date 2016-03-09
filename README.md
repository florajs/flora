Flora
=====

[![Build Status](https://travis-ci.org/godmodelabs/flora.svg?branch=master)](https://travis-ci.org/godmodelabs/flora)
[![NPM version](https://badge.fury.io/js/flora.svg)](https://www.npmjs.com/package/flora)
[![Dependencies](https://img.shields.io/david/godmodelabs/flora.svg)](https://david-dm.org/godmodelabs/flora)

Flora is a FLexible Open Rest API framework for [Node.js](http://nodejs.org/).

**It is still under heavy develoment, but slowly approaching beta status**


Features
--------

- Resources in resources (recursive) - *fetch as much as possible in one request, without duplicating code*
- Lightweight (but powerful) field/sub-resource selection syntax - *fetch exactly what you need in one request*
- Filter resources even by sub-resource-attributes - *resolve inside database when possible, else feeding ID-lists*
- Pluggable DataSources - *currently implemented: MySQL, Solr/Lucene*
- Combine multiple DataSources - *even on per-row-basis - "API-side-JOIN"*
- Highly optimized database querys - *internal SQL parser to remove unselected fields and thus unreferenced LEFT JOINs*
- Locale: Parameterize JOINs i.e. with a localeId - *no need for database views which can't be parameterized*
- Handle all your special cases as good as possible - *callbacks for "everything"*


Server-Features
---------------

- Node.js HTTP-Server and Cluster based implementation with self-monitoring process-management
- Extremely verbose server-status - *see everytime what the server is doing and what is hanging around in production*
- Straightforward logging/error handling - *i.e. forward all errors to your favorite "error-monitoring-tool"*
- Updates in production with zero downtime - *almost every part of code and config is replaceable without shutdown*
- Comfortable development-features - *usual "code-change - F5 - see result"-workflow*


Design Goals
------------

- Generic implementation just for reading - *offer helper for writing*
- Easy abstraction of complex and distributed database structures
- Easy standard cases with minimal boilerplate code - *special cases possible - "everywhere"*
- Flexibility, stability, performance, simplicity, transparency


Examples
--------

### URL structure

#### Format:

```
/path/to/resource/<id>
    ?do=<action>
    &select=xxx
    &filter=xxx
    &limit=10
    &page=1
    &width=100 (additional parameters)
    &height=100
```

#### Examples:

- `GET /article/123` (retrieve article 123 as JSON)
- `GET /article/` (list of all articles)


### Resource-Implementation

```js
module.exports = (api) => {
    return {
        actions: {
            retrieve: (request, response) => {
                api.resourceProcessor.handle(request, response)
            },

            hello: (request, response) => {
                response.send('Hello World');
            }
        }
    }
};
```

### Abstract definition

```xml
<?xml version="1.0" encoding="utf-8"?>
<resource primaryKey="id" xmlns:flora="urn:flora:options">
    <flora:dataSource type="mysql" database="contents" table="user"/>
    <id type="int"/>
    <firstname/>
    <lastname/>
</resource>
```

License
-------

[MIT](LICENSE)

'use strict';

var util = require('util');

/*
Maybe relevant HTTP status codes:

200 OK
201 Created
204 No Content

301 Moved Permanently
303 See Other
304 Not Modified
307 Temporary Redirect

400 Bad Request
403 Forbidden
404 Not Found
405 Method Not Allowed
415 Unsupported Media Type
429 Too Many Requests

500 Internal Server Error
501 Not Implemented
503 Service Unavailable
*/

/**
 * Base class for flora errors.
 *
 * @extends Error
 * @constructor
 * @param {string} message
 */
function FloraError(message) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;

    /**
     * @type {string}
     * @name FloraError#message
     * @readonly
     */
    this.message = message;

    /**
     * @type {number}
     * @name FloraError#httpStatusCode
     * @readonly
     */
    this.httpStatusCode = 503; // HTTP status for "other errors"
}
util.inherits(FloraError, Error);

/**
 * @extends FloraError
 * @constructor
 * @param {string} message
 */
function RequestError(message) {
    FloraError.call(this, message);
    this.httpStatusCode = 400;
}
util.inherits(RequestError, FloraError);

/**
 * @extends FloraError
 * @constructor
 * @param {string} message
 */
function AuthenticationError(message) {
    FloraError.call(this, message);
    this.httpStatusCode = 401;
}
util.inherits(AuthenticationError, FloraError);

/**
 * @extends FloraError
 * @constructor
 * @param {string} message
 */
function AuthorizationError(message) {
    FloraError.call(this, message);
    this.httpStatusCode = 403;
}
util.inherits(AuthorizationError, FloraError);

/**
 * @extends FloraError
 * @constructor
 * @param {string} message
 */
function NotFoundError(message) {
    FloraError.call(this, message);
    this.httpStatusCode = 404;
}
util.inherits(NotFoundError, FloraError);

/**
 * @extends FloraError
 * @constructor
 * @param {string} message
 */
function ImplementationError(message) {
    FloraError.call(this, message);
    this.httpStatusCode = 500;
}
util.inherits(ImplementationError, FloraError);

/**
 * @extends FloraError
 * @constructor
 * @param {string} message
 */
function DataError(message) {
    FloraError.call(this, message);
    this.httpStatusCode = 500;
}
util.inherits(DataError, FloraError);

/**
 * @extends FloraError
 * @constructor
 * @param {string} message
 */
function ConnectionError(message) {
    FloraError.call(this, message);
    this.httpStatusCode = 503;
}
util.inherits(ConnectionError, FloraError);

module.exports = {
    RequestError: RequestError,
    AuthenticationError: AuthenticationError,
    AuthorizationError: AuthorizationError,
    NotFoundError: NotFoundError,
    ImplementationError: ImplementationError,
    DataError: DataError,
    ConnectionError: ConnectionError
};

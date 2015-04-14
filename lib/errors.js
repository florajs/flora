'use strict';

var util = require('util');

/**
 * Base class for Flora errors.
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

/**
 * Converts an error object to a stringifyable object format for use
 * in Flora responses.
 *
 * @param {Error} error object
 */
function format(err, exposeErrors) {
    var error = {
        message: 'Internal Server Error'
    };

    if (err.httpStatusCode && err.httpStatusCode < 500) {
        error.message = err.message;
    }

    // TODO: code: err.code ??

    if (exposeErrors) {
        error.message = err.message;
        error.stack = err.stack.split(/\r?\n/);
    }

    return error;
}

module.exports = {
    RequestError: RequestError,
    AuthenticationError: AuthenticationError,
    AuthorizationError: AuthorizationError,
    NotFoundError: NotFoundError,
    ImplementationError: ImplementationError,
    DataError: DataError,
    ConnectionError: ConnectionError,
    format: format
};

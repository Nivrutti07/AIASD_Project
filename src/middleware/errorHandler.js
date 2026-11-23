const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode = 400, errorCode = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function errorHandler(err, req, res, next) {
  logger.error(`Error processing request ${req.method} ${req.url}: ${err.message}`, {
    stack: err.stack,
    code: err.code
  });

  // Joi schema validation error
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.details.map(d => d.message).join('; '),
        details: err.details
      }
    });
  }

  // PostgreSQL unique violation error (code 23505)
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_RECORD',
        message: 'A record with matching unique identifier or email already exists.',
        details: err.detail
      }
    });
  }

  // PostgreSQL foreign key violation (code 23503)
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'FOREIGN_KEY_VIOLATION',
        message: 'Referenced entity does not exist.',
        details: err.detail
      }
    });
  }

  // PostgreSQL check constraint violation (code 23514)
  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CONSTRAINT_VIOLATION',
        message: 'Data constraint violation (e.g. quantity must be positive, valid dates).',
        details: err.constraint
      }
    });
  }

  // Known operational AppError
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.errorCode,
        message: err.message
      }
    });
  }

  // Fallback 500 Internal Server Error
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred on the server.'
    }
  });
}

module.exports = {
  AppError,
  errorHandler
};

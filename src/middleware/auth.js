const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError } = require('./errorHandler');

/**
 * Middleware to authenticate JWT token from Authorization header
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return next(new AppError('Authentication token is missing', 401, 'UNAUTHORIZED'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next(new AppError('Invalid token format. Expected: Bearer <token>', 401, 'INVALID_TOKEN_FORMAT'));
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token has expired. Please log in again.', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Invalid or corrupted authentication token', 401, 'INVALID_TOKEN'));
  }
}

/**
 * Middleware to restrict route access to specific ISA roles
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(
        `Access denied. Role '${req.user.role}' is not authorized for this resource. Required: ${allowedRoles.join(', ')}`,
        403,
        'FORBIDDEN'
      ));
    }

    next();
  };
}

/**
 * Sanitizes donor records before sending to hospitals/patients/public
 * Enforces FR donor privacy rule: NEVER expose donor phone number or sensitive notes to requesters!
 */
function sanitizeDonorForRequester(donor) {
  if (!donor) return donor;
  const sanitized = { ...donor };
  delete sanitized.phone;
  delete sanitized.contact_phone;
  delete sanitized.medical_history;
  return sanitized;
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  sanitizeDonorForRequester
};

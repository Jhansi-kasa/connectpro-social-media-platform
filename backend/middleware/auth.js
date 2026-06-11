const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError, catchAsync } = require('../utils/helpers');

/**
 * Protect routes — require valid JWT
 */
const protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to access this resource.', 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    return next(new AppError('Invalid token. Please log in again.', 401));
  }

  const user = await User.findById(decoded.id).select('+passwordChangedAt');
  if (!user) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  if (user.isBanned) {
    return next(new AppError('Your account has been suspended. Contact support for help.', 403));
  }

  if (user.isDeactivated) {
    return next(new AppError('Your account is deactivated. Log in to reactivate it.', 403));
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password was recently changed. Please log in again.', 401));
  }

  req.user = user;
  next();
});

/**
 * Optional auth — attach user if token present, else continue
 */
const optionalAuth = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    } catch (_) {
      // continue without user
    }
  }
  next();
});

/**
 * Role-based access control
 */
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action.', 403));
  }
  next();
};

/**
 * Check email is verified for sensitive operations
 */
const requireEmailVerified = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return next(new AppError('Please verify your email address first.', 403));
  }
  next();
};

module.exports = { protect, optionalAuth, authorize, requireEmailVerified };

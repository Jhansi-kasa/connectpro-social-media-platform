const logger = require('../utils/logger');

const handleCastError = (err) => ({
  statusCode: 400,
  message: `Invalid ${err.path}: ${err.value}`,
});

const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  return { statusCode: 400, message: `${field} '${value}' is already taken.` };
};

const handleValidationError = (err) => ({
  statusCode: 400,
  message: Object.values(err.errors)
    .map((e) => e.message)
    .join('. '),
});

const handleJWTError = () => ({ statusCode: 401, message: 'Invalid token. Please log in again.' });
const handleJWTExpiredError = () => ({ statusCode: 401, message: 'Your session has expired. Please log in again.' });

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Log error
  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.url} - ${statusCode} - ${message}\n${err.stack}`);
  } else {
    logger.warn(`${req.method} ${req.url} - ${statusCode} - ${message}`);
  }

  // Mongoose / JWT specific errors
  if (err.name === 'CastError') ({ statusCode, message } = handleCastError(err));
  if (err.code === 11000) ({ statusCode, message } = handleDuplicateKey(err));
  if (err.name === 'ValidationError') ({ statusCode, message } = handleValidationError(err));
  if (err.name === 'JsonWebTokenError') ({ statusCode, message } = handleJWTError());
  if (err.name === 'TokenExpiredError') ({ statusCode, message } = handleJWTExpiredError());

  const response = {
    success: false,
    message,
  };

  if (process.env.NODE_ENV === 'development') {
    response.error = err;
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;

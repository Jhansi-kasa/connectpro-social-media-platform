/**
 * Custom error class for operational errors
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Wrap async route handlers to catch errors
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Standard success response
 */
const successResponse = (res, statusCode, message, data = {}, meta = {}) => {
  const response = { success: true, message };
  if (Object.keys(data).length) response.data = data;
  if (Object.keys(meta).length) response.meta = meta;
  return res.status(statusCode).json(response);
};

/**
 * Build pagination meta
 */
const paginationMeta = (total, page, limit) => ({
  total,
  page: parseInt(page),
  limit: parseInt(limit),
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

module.exports = { AppError, catchAsync, successResponse, paginationMeta };

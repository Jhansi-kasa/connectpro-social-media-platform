const { validationResult, body, param, query } = require('express-validator');
const { AppError } = require('../utils/helpers');

/**
 * Run validation result check — call after validator chain
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg).join('. ');
    return next(new AppError(messages, 400));
  }
  next();
};

// ── AUTH VALIDATORS ───────────────────────────────────────────────────────────
const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 50 }).withMessage('Name max 50 chars'),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
    .matches(/^[a-z0-9._]+$/i).withMessage('Username can only contain letters, numbers, dots and underscores')
    .toLowerCase(),
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/\d/).withMessage('Password must contain a number')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter'),
  validate,
];

const loginValidator = [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

const forgotPasswordValidator = [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  validate,
];

const resetPasswordValidator = [
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/\d/).withMessage('Password must contain a number'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
  validate,
];

const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/\d/).withMessage('Password must contain a number'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.newPassword) throw new Error('Passwords do not match');
    return true;
  }),
  validate,
];

// ── POST VALIDATORS ───────────────────────────────────────────────────────────
const createPostValidator = [
  body('content').optional().isLength({ max: 2200 }).withMessage('Post content max 2200 characters'),
  body('visibility').optional().isIn(['public', 'followers', 'private']).withMessage('Invalid visibility'),
  validate,
];

// ── COMMENT VALIDATORS ────────────────────────────────────────────────────────
const createCommentValidator = [
  body('content').trim().notEmpty().withMessage('Comment content is required').isLength({ max: 1000 }).withMessage('Comment max 1000 characters'),
  validate,
];

// ── PROFILE VALIDATORS ────────────────────────────────────────────────────────
const updateProfileValidator = [
  body('name').optional().trim().isLength({ max: 50 }).withMessage('Name max 50 characters'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
    .matches(/^[a-z0-9._]+$/i).withMessage('Username can only contain letters, numbers, dots and underscores')
    .toLowerCase(),
  body('bio').optional().isLength({ max: 160 }).withMessage('Bio max 160 characters'),
  body('website').optional().isURL().withMessage('Please provide a valid URL'),
  validate,
];

// ── MESSAGE VALIDATORS ────────────────────────────────────────────────────────
const sendMessageValidator = [
  body('content').optional().isLength({ max: 2000 }).withMessage('Message max 2000 characters'),
  validate,
];

// ── PAGINATION ────────────────────────────────────────────────────────────────
const paginationValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  validate,
];

module.exports = {
  validate,
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
  createPostValidator,
  createCommentValidator,
  updateProfileValidator,
  sendMessageValidator,
  paginationValidator,
};

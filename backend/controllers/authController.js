const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError, catchAsync, successResponse } = require('../utils/helpers');
const { sendTokenResponse, generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendAccountDeletionEmail,
} = require('../utils/email');

// ── REGISTER ──────────────────────────────────────────────────────────────────
exports.register = catchAsync(async (req, res, next) => {
  const { name, username, email, password } = req.body;

  // Check if username or email already exists
  const existing = await User.findOne({ $or: [{ email }, { username: username.toLowerCase() }] });
  if (existing) {
    return next(
      new AppError(
        existing.email === email ? 'Email is already registered.' : 'Username is already taken.',
        400
      )
    );
  }

  const user = await User.create({ name, username: username.toLowerCase(), email, password });

  // Generate and send email verification token
  const verificationToken = user.generateEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  try {
    await sendVerificationEmail(user, verificationToken);
  } catch (_) {
    // Don't block registration if email fails
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });
  }

  sendTokenResponse(user, 201, res, 'Registration successful! Please verify your email.');
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password.', 401));
  }

  if (user.isBanned) return next(new AppError('Your account has been suspended.', 403));

  // Re-activate deactivated accounts on login
  if (user.isDeactivated) {
    user.isDeactivated = false;
    user.deactivatedAt = undefined;
    user.isActive = true;
  }

  user.lastLogin = Date.now();
  user.isOnline = true;
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, res, 'Login successful.');
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
exports.logout = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user._id, { isOnline: false, lastSeen: Date.now(), refreshToken: null });

  res
    .cookie('accessToken', '', { expires: new Date(0), httpOnly: true })
    .cookie('refreshToken', '', { expires: new Date(0), httpOnly: true })
    .json({ success: true, message: 'Logged out successfully.' });
});

// ── REFRESH TOKEN ─────────────────────────────────────────────────────────────
exports.refreshToken = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) return next(new AppError('No refresh token provided.', 401));

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (_) {
    return next(new AppError('Invalid or expired refresh token.', 401));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== token) {
    return next(new AppError('Invalid refresh token.', 401));
  }

  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);
  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  };

  res
    .cookie('accessToken', newAccessToken, { ...cookieOptions, expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
    .cookie('refreshToken', newRefreshToken, { ...cookieOptions, expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
    .json({ success: true, data: { accessToken: newAccessToken } });
});

// ── VERIFY EMAIL ──────────────────────────────────────────────────────────────
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpire: { $gt: Date.now() },
  });

  if (!user) return next(new AppError('Invalid or expired verification token.', 400));

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save({ validateBeforeSave: false });

  try { await sendWelcomeEmail(user); } catch (_) {}

  successResponse(res, 200, 'Email verified successfully!');
});

// ── RESEND VERIFICATION ───────────────────────────────────────────────────────
exports.resendVerification = catchAsync(async (req, res, next) => {
  if (req.user.isEmailVerified) return next(new AppError('Email is already verified.', 400));

  const token = req.user.generateEmailVerificationToken();
  await req.user.save({ validateBeforeSave: false });
  await sendVerificationEmail(req.user, token);

  successResponse(res, 200, 'Verification email sent.');
});

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  // Always return 200 to prevent email enumeration
  if (!user) return successResponse(res, 200, 'If that email exists, a reset link has been sent.');

  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    await sendPasswordResetEmail(user, resetToken);
  } catch (_) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Failed to send reset email. Please try again.', 500));
  }

  successResponse(res, 200, 'If that email exists, a reset link has been sent.');
});

// ── RESET PASSWORD ────────────────────────────────────────────────────────────
exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) return next(new AppError('Invalid or expired reset token.', 400));

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  user.refreshToken = undefined; // Invalidate all sessions
  await user.save();

  sendTokenResponse(user, 200, res, 'Password reset successful.');
});

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────────
exports.changePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    return next(new AppError('Current password is incorrect.', 401));
  }

  user.password = req.body.newPassword;
  user.refreshToken = undefined;
  await user.save();

  sendTokenResponse(user, 200, res, 'Password changed successfully. Please log in again.');
});

// ── GET ME ────────────────────────────────────────────────────────────────────
exports.getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  successResponse(res, 200, 'Success', { user });
});

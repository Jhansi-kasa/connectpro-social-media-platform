const User = require('../models/User');
const { AppError, catchAsync, successResponse } = require('../utils/helpers');

// ── GET SETTINGS ──────────────────────────────────────────────────────────────
exports.getSettings = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('settings email isEmailVerified');
  successResponse(res, 200, 'Settings fetched.', { settings: user.settings, email: user.email, isEmailVerified: user.isEmailVerified });
});

// ── UPDATE PRIVACY ────────────────────────────────────────────────────────────
exports.updatePrivacy = catchAsync(async (req, res) => {
  const { profileVisibility, showFollowers, showFollowing, allowMessagesFrom, allowTagging, showLocation } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      'settings.privacy.profileVisibility': profileVisibility,
      'settings.privacy.showFollowers': showFollowers,
      'settings.privacy.showFollowing': showFollowing,
      'settings.privacy.allowMessagesFrom': allowMessagesFrom,
      'settings.privacy.allowTagging': allowTagging,
      'settings.privacy.showLocation': showLocation,
    },
    { new: true, runValidators: true }
  );

  successResponse(res, 200, 'Privacy settings updated.', { privacy: user.settings.privacy });
});

// ── UPDATE NOTIFICATION SETTINGS ──────────────────────────────────────────────
exports.updateNotificationSettings = catchAsync(async (req, res) => {
  const { likes, comments, follows, messages, mentions, email, push } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      'settings.notifications.likes': likes,
      'settings.notifications.comments': comments,
      'settings.notifications.follows': follows,
      'settings.notifications.messages': messages,
      'settings.notifications.mentions': mentions,
      'settings.notifications.email': email,
      'settings.notifications.push': push,
    },
    { new: true }
  );

  successResponse(res, 200, 'Notification settings updated.', { notifications: user.settings.notifications });
});

// ── UPDATE THEME ──────────────────────────────────────────────────────────────
exports.updateTheme = catchAsync(async (req, res, next) => {
  const { theme } = req.body;
  if (!['light', 'dark', 'system'].includes(theme)) {
    return next(new AppError('Invalid theme. Must be light, dark or system.', 400));
  }

  await User.findByIdAndUpdate(req.user._id, { 'settings.theme': theme });
  successResponse(res, 200, 'Theme updated.', { theme });
});

// ── UPDATE LANGUAGE ────────────────────────────────────────────────────────────
exports.updateLanguage = catchAsync(async (req, res) => {
  const { language } = req.body;
  await User.findByIdAndUpdate(req.user._id, { 'settings.language': language });
  successResponse(res, 200, 'Language updated.', { language });
});

// ── UPDATE EMAIL ──────────────────────────────────────────────────────────────
exports.updateEmail = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(password))) {
    return next(new AppError('Incorrect password.', 401));
  }

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return next(new AppError('Email is already in use.', 400));

  user.email = email.toLowerCase();
  user.isEmailVerified = false;
  await user.save({ validateBeforeSave: false });

  // Resend verification
  const { sendVerificationEmail } = require('../utils/email');
  const token = user.generateEmailVerificationToken();
  await user.save({ validateBeforeSave: false });
  try { await sendVerificationEmail(user, token); } catch (_) {}

  successResponse(res, 200, 'Email updated. Please verify your new email address.');
});

const User = require('../models/User');
const Post = require('../models/Post');
const { Report } = require('../models');
const { AppError, catchAsync, successResponse, paginationMeta } = require('../utils/helpers');

// ── DASHBOARD ANALYTICS ────────────────────────────────────────────────────────
exports.getDashboard = catchAsync(async (req, res) => {
  const [totalUsers, activeUsers, totalPosts, pendingReports, newUsersToday] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true, isBanned: false }),
    Post.countDocuments({ isDraft: false, isHidden: false }),
    Report.countDocuments({ status: 'pending' }),
    User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
  ]);

  successResponse(res, 200, 'Dashboard analytics.', {
    stats: { totalUsers, activeUsers, totalPosts, pendingReports, newUsersToday },
  });
});

// ── USER MANAGEMENT ────────────────────────────────────────────────────────────
exports.getUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (search) filter.$text = { $search: search };
  if (status === 'banned') filter.isBanned = true;
  if (status === 'active') { filter.isActive = true; filter.isBanned = false; }
  if (status === 'deactivated') filter.isDeactivated = true;

  const [users, total] = await Promise.all([
    User.find(filter).select('-password -refreshToken').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    User.countDocuments(filter),
  ]);

  successResponse(res, 200, 'Users fetched.', { users }, paginationMeta(total, page, limit));
});

exports.banUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { reason } = req.body;

  const user = await User.findById(userId);
  if (!user) return next(new AppError('User not found.', 404));
  if (user.role === 'admin') return next(new AppError('Cannot ban admin users.', 403));

  await User.findByIdAndUpdate(userId, {
    isBanned: true,
    bannedAt: Date.now(),
    bannedReason: reason || 'Violation of community guidelines.',
    isActive: false,
    refreshToken: null,
  });

  successResponse(res, 200, 'User banned.');
});

exports.unbanUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return next(new AppError('User not found.', 404));

  await User.findByIdAndUpdate(userId, {
    isBanned: false,
    bannedAt: undefined,
    bannedReason: undefined,
    isActive: true,
  });

  successResponse(res, 200, 'User unbanned.');
});

// ── CONTENT MODERATION ─────────────────────────────────────────────────────────
exports.getReports = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status = 'pending' } = req.query;
  const skip = (page - 1) * limit;

  const [reports, total] = await Promise.all([
    Report.find({ status })
      .populate('reporter', 'name username')
      .populate('target')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Report.countDocuments({ status }),
  ]);

  successResponse(res, 200, 'Reports fetched.', { reports }, paginationMeta(total, page, limit));
});

exports.resolveReport = catchAsync(async (req, res, next) => {
  const { resolution, action } = req.body;
  const report = await Report.findById(req.params.reportId);
  if (!report) return next(new AppError('Report not found.', 404));

  report.status = 'resolved';
  report.resolvedBy = req.user._id;
  report.resolvedAt = Date.now();
  report.resolution = resolution;
  await report.save();

  // Take action
  if (action === 'hide_content' && report.targetModel === 'Post') {
    await Post.findByIdAndUpdate(report.target, { isHidden: true, hiddenReason: resolution });
  }
  if (action === 'ban_user') {
    await User.findByIdAndUpdate(report.target, { isBanned: true, bannedReason: resolution });
  }

  successResponse(res, 200, 'Report resolved.');
});

exports.createReport = catchAsync(async (req, res, next) => {
  const { targetId, targetModel, reason, description } = req.body;

  // Prevent duplicate reports
  const exists = await Report.findOne({ reporter: req.user._id, target: targetId, targetModel, status: 'pending' });
  if (exists) return next(new AppError('You have already reported this content.', 400));

  const report = await Report.create({
    reporter: req.user._id,
    target: targetId,
    targetModel,
    reason,
    description,
  });

  successResponse(res, 201, 'Report submitted.', { report });
});

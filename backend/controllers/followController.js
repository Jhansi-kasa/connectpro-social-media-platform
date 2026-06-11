const User = require('../models/User');
const { Follow } = require('../models');
const { AppError, catchAsync, successResponse, paginationMeta } = require('../utils/helpers');
const { createNotification } = require('../services/notificationService');

exports.toggleFollow = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  if (userId === req.user._id.toString()) return next(new AppError('You cannot follow yourself.', 400));

  const target = await User.findById(userId).select('settings.privacy isActive isBanned');
  if (!target || !target.isActive || target.isBanned) return next(new AppError('User not found.', 404));

  // Check block
  if (target.blockedUsers?.includes(req.user._id)) return next(new AppError('User not found.', 404));

  const existing = await Follow.findOne({ follower: req.user._id, following: userId });

  if (existing) {
    await existing.deleteOne();
    await User.findByIdAndUpdate(req.user._id, { $pull: { following: userId }, $inc: { followingCount: -1 } });
    await User.findByIdAndUpdate(userId, { $pull: { followers: req.user._id }, $inc: { followersCount: -1 } });
    return successResponse(res, 200, 'Unfollowed.', { following: false });
  }

  const isPrivate = target.settings?.privacy?.profileVisibility === 'private';
  const status = isPrivate ? 'pending' : 'accepted';

  await Follow.create({ follower: req.user._id, following: userId, status });

  if (status === 'accepted') {
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { following: userId }, $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(userId, { $addToSet: { followers: req.user._id }, $inc: { followersCount: 1 } });
  }

  await createNotification(req.app.get('io'), {
    recipient: userId,
    sender: req.user._id,
    type: status === 'pending' ? 'follow_request' : 'follow',
  });

  successResponse(res, 200, status === 'pending' ? 'Follow request sent.' : 'Following.', {
    following: status === 'accepted',
    pending: status === 'pending',
  });
});

exports.acceptFollowRequest = catchAsync(async (req, res, next) => {
  const { followerId } = req.params;
  const follow = await Follow.findOne({ follower: followerId, following: req.user._id, status: 'pending' });
  if (!follow) return next(new AppError('Follow request not found.', 404));

  follow.status = 'accepted';
  await follow.save();

  await User.findByIdAndUpdate(followerId, { $addToSet: { following: req.user._id }, $inc: { followingCount: 1 } });
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { followers: followerId }, $inc: { followersCount: 1 } });

  successResponse(res, 200, 'Follow request accepted.');
});

exports.declineFollowRequest = catchAsync(async (req, res, next) => {
  const { followerId } = req.params;
  const deleted = await Follow.findOneAndDelete({ follower: followerId, following: req.user._id, status: 'pending' });
  if (!deleted) return next(new AppError('Follow request not found.', 404));
  successResponse(res, 200, 'Follow request declined.');
});

exports.getFollowers = catchAsync(async (req, res, next) => {
  const { username } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const user = await User.findOne({ username });
  if (!user) return next(new AppError('User not found.', 404));

  const skip = (page - 1) * limit;
  const [follows, total] = await Promise.all([
    Follow.find({ following: user._id, status: 'accepted' })
      .populate('follower', 'name username avatar bio')
      .skip(skip)
      .limit(parseInt(limit)),
    Follow.countDocuments({ following: user._id, status: 'accepted' }),
  ]);

  successResponse(res, 200, 'Followers fetched.', { users: follows.map((f) => f.follower) }, paginationMeta(total, page, limit));
});

exports.getFollowing = catchAsync(async (req, res, next) => {
  const { username } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const user = await User.findOne({ username });
  if (!user) return next(new AppError('User not found.', 404));

  const skip = (page - 1) * limit;
  const [follows, total] = await Promise.all([
    Follow.find({ follower: user._id, status: 'accepted' })
      .populate('following', 'name username avatar bio')
      .skip(skip)
      .limit(parseInt(limit)),
    Follow.countDocuments({ follower: user._id, status: 'accepted' }),
  ]);

  successResponse(res, 200, 'Following fetched.', { users: follows.map((f) => f.following) }, paginationMeta(total, page, limit));
});

exports.getPendingRequests = catchAsync(async (req, res) => {
  const requests = await Follow.find({ following: req.user._id, status: 'pending' })
    .populate('follower', 'name username avatar');
  successResponse(res, 200, 'Pending requests.', { requests: requests.map((r) => r.follower) });
});

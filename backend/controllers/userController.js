const User = require('../models/User');
const Post = require('../models/Post');
const { Follow, SavedPost } = require('../models');
const { AppError, catchAsync, successResponse, paginationMeta } = require('../utils/helpers');
const { deleteMedia } = require('../config/cloudinary');

// ── GET USER PROFILE ──────────────────────────────────────────────────────────
// ── GET USER PROFILE ──────────────────────────────────────────────────────────
exports.getProfile = catchAsync(async (req, res, next) => {
  const { username } = req.params;
  const viewer = req.user;

  const user = await User.findOne({ username, isActive: true, isBanned: false })
    .select('-password -refreshToken -emailVerificationToken -resetPasswordToken');

  if (!user) return next(new AppError('User not found.', 404));

  // Check if viewer is blocked
  if (viewer && user.isBlocking(viewer._id)) {
    return next(new AppError('User not found.', 404));
  }

  // Check privacy
  const isOwnProfile = viewer?._id.toString() === user._id.toString();
  const isFollowing = viewer
    ? await Follow.exists({ follower: viewer._id, following: user._id, status: 'accepted' })
    : false;

  const profileData = user.toObject();
  delete profileData.blockedUsers;
  profileData.isFollowing = !!isFollowing;
  profileData.isOwnProfile = isOwnProfile;

  // Hide followers/following counts if private
  if (!user.settings?.privacy?.showFollowers && !isOwnProfile) delete profileData.followers;
  if (!user.settings?.privacy?.showFollowing && !isOwnProfile) delete profileData.following;

  successResponse(res, 200, 'Profile fetched.', { user: profileData });
});
// ── UPDATE PROFILE ────────────────────────────────────────────────────────────
exports.updateProfile = catchAsync(async (req, res, next) => {
  const { name, username, bio, website, location, dateOfBirth, gender } = req.body;

  // Check username uniqueness
  if (username && username !== req.user.username) {
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return next(new AppError('Username is already taken.', 400));
  }

  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { name, username: username?.toLowerCase(), bio, website, location, dateOfBirth, gender },
    { new: true, runValidators: true }
  );

  successResponse(res, 200, 'Profile updated.', { user: updated });
});

// ── UPLOAD AVATAR ─────────────────────────────────────────────────────────────
exports.uploadAvatar = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please provide an image.', 400));

  // Delete old avatar from Cloudinary
  if (req.user.avatar?.publicId) {
    await deleteMedia(req.user.avatar.publicId);
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { avatar: { url: req.file.path, publicId: req.file.filename } },
    { new: true }
  );

  successResponse(res, 200, 'Avatar updated.', { avatar: user.avatar });
});

// ── UPLOAD COVER PHOTO ────────────────────────────────────────────────────────
exports.uploadCoverPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please provide an image.', 400));

  if (req.user.coverPhoto?.publicId) {
    await deleteMedia(req.user.coverPhoto.publicId);
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { coverPhoto: { url: req.file.path, publicId: req.file.filename } },
    { new: true }
  );

  successResponse(res, 200, 'Cover photo updated.', { coverPhoto: user.coverPhoto });
});

// ── GET USER POSTS ────────────────────────────────────────────────────────────
exports.getUserPosts = catchAsync(async (req, res, next) => {
  const { username } = req.params;
  const { page = 1, limit = 12 } = req.query;
  const skip = (page - 1) * limit;

  const user = await User.findOne({ username, isActive: true });
  if (!user) return next(new AppError('User not found.', 404));

  const isOwnProfile = req.user?._id.toString() === user._id.toString();
  const isFollowing = req.user
    ? await Follow.exists({ follower: req.user._id, following: user._id, status: 'accepted' })
    : false;

  // Build visibility filter
  let visibilityFilter = ['public'];
  if (isOwnProfile) visibilityFilter = ['public', 'followers', 'private'];
  else if (isFollowing) visibilityFilter = ['public', 'followers'];

  const filter = { author: user._id, isDraft: false, isHidden: false, visibility: { $in: visibilityFilter } };

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .populate('author', 'name username avatar')
      .populate('originalPost')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Post.countDocuments(filter),
  ]);

  successResponse(res, 200, 'Posts fetched.', { posts }, paginationMeta(total, page, limit));
});

// ── GET SAVED POSTS ────────────────────────────────────────────────────────────
exports.getSavedPosts = catchAsync(async (req, res) => {
  const { page = 1, limit = 12 } = req.query;
  const skip = (page - 1) * limit;

  const [saved, total] = await Promise.all([
    SavedPost.find({ user: req.user._id })
      .populate({ path: 'post', populate: { path: 'author', select: 'name username avatar' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    SavedPost.countDocuments({ user: req.user._id }),
  ]);

  successResponse(res, 200, 'Saved posts fetched.', { posts: saved.map((s) => s.post) }, paginationMeta(total, page, limit));
});

// ── SUGGESTED USERS ────────────────────────────────────────────────────────────
exports.getSuggestedUsers = catchAsync(async (req, res) => {
  const { limit = 5 } = req.query;

  const following = await Follow.find({ follower: req.user._id }).distinct('following');
  const blocked = req.user.blockedUsers || [];
  const excluded = [...following, ...blocked, req.user._id];

  const users = await User.find({
    _id: { $nin: excluded },
    isActive: true,
    isBanned: false,
    'settings.privacy.profileVisibility': { $ne: 'private' },
  })
    .select('name username avatar bio followersCount')
    .sort({ followersCount: -1 })
    .limit(parseInt(limit));

  successResponse(res, 200, 'Suggested users.', { users });
});

// ── BLOCKED USERS ─────────────────────────────────────────────────────────────
exports.getBlockedUsers = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate('blockedUsers', 'name username avatar');
  successResponse(res, 200, 'Blocked users.', { users: user.blockedUsers });
});

exports.blockUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  if (userId === req.user._id.toString()) return next(new AppError('You cannot block yourself.', 400));

  const target = await User.findById(userId);
  if (!target) return next(new AppError('User not found.', 404));

  // Add to blockedUsers, unfollow both directions
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { blockedUsers: userId } });
  await Follow.deleteMany({
    $or: [
      { follower: req.user._id, following: userId },
      { follower: userId, following: req.user._id },
    ],
  });
  // Update counts
  await User.findByIdAndUpdate(req.user._id, { $inc: { followingCount: -1 } });
  await User.findByIdAndUpdate(userId, { $inc: { followersCount: -1 } });

  successResponse(res, 200, 'User blocked.');
});

exports.unblockUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  await User.findByIdAndUpdate(req.user._id, { $pull: { blockedUsers: userId } });
  successResponse(res, 200, 'User unblocked.');
});

// ── DEACTIVATE / DELETE ACCOUNT ────────────────────────────────────────────────
exports.deactivateAccount = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    isDeactivated: true,
    isActive: false,
    deactivatedAt: Date.now(),
    isOnline: false,
  });

  res
    .cookie('accessToken', '', { expires: new Date(0), httpOnly: true })
    .cookie('refreshToken', '', { expires: new Date(0), httpOnly: true })
    .json({ success: true, message: 'Account deactivated. Log in to reactivate.' });
});

exports.deleteAccount = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.password))) {
    return next(new AppError('Incorrect password.', 401));
  }

  // Soft delete: anonymize instead of hard delete
  await User.findByIdAndUpdate(req.user._id, {
    isActive: false,
    isBanned: true,
    email: `deleted_${req.user._id}@deleted.connectpro`,
    username: `deleted_${req.user._id}`,
    name: 'Deleted User',
    avatar: { url: '', publicId: '' },
    bio: '',
    isOnline: false,
  });

  res
    .cookie('accessToken', '', { expires: new Date(0), httpOnly: true })
    .cookie('refreshToken', '', { expires: new Date(0), httpOnly: true })
    .json({ success: true, message: 'Account deleted successfully.' });
});

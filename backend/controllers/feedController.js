const Post = require('../models/Post');
const { Follow, Like, SavedPost } = require('../models');
const { catchAsync, successResponse, paginationMeta } = require('../utils/helpers');

// ── HOME FEED (Following) ─────────────────────────────────────────────────────
exports.getHomeFeed = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const followingIds = await Follow.find({ follower: req.user._id, status: 'accepted' }).distinct('following');
  followingIds.push(req.user._id); // include own posts

  const filter = {
    author: { $in: followingIds },
    isDraft: false,
    isHidden: false,
    visibility: { $in: ['public', 'followers'] },
  };

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .populate('author', 'name username avatar')
      .populate('originalPost')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Post.countDocuments(filter),
  ]);

  // Attach like/save status
  let likedIds = new Set(), savedIds = new Set();
  if (posts.length) {
    const postIds = posts.map((p) => p._id);
    const [likes, saved] = await Promise.all([
      Like.find({ user: req.user._id, target: { $in: postIds }, targetModel: 'Post' }).distinct('target'),
      SavedPost.find({ user: req.user._id, post: { $in: postIds } }).distinct('post'),
    ]);
    likedIds = new Set(likes.map((id) => id.toString()));
    savedIds = new Set(saved.map((id) => id.toString()));
  }

  const enriched = posts.map((p) => {
    const obj = p.toObject();
    obj.isLiked = likedIds.has(p._id.toString());
    obj.isSaved = savedIds.has(p._id.toString());
    return obj;
  });

  successResponse(res, 200, 'Home feed fetched.', { posts: enriched }, paginationMeta(total, page, limit));
});

// ── EXPLORE / TRENDING FEED ───────────────────────────────────────────────────
exports.getExploreFeed = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const blockedUsers = req.user?.blockedUsers || [];

  // Trending: public posts, sorted by engagement in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filter = {
    visibility: 'public',
    isDraft: false,
    isHidden: false,
    author: { $nin: blockedUsers },
    createdAt: { $gte: sevenDaysAgo },
  };

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .populate('author', 'name username avatar')
      .sort({ likesCount: -1, commentsCount: -1, viewsCount: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Post.countDocuments(filter),
  ]);

  successResponse(res, 200, 'Explore feed fetched.', { posts }, paginationMeta(total, page, limit));
});

// ── TRENDING HASHTAGS ─────────────────────────────────────────────────────────
exports.getTrendingHashtags = catchAsync(async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const hashtags = await Post.aggregate([
    { $match: { visibility: 'public', isDraft: false, createdAt: { $gte: sevenDaysAgo } } },
    { $unwind: '$hashtags' },
    { $group: { _id: '$hashtags', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
    { $project: { hashtag: '$_id', count: 1, _id: 0 } },
  ]);

  successResponse(res, 200, 'Trending hashtags.', { hashtags });
});

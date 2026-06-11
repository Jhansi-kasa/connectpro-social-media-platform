const User = require('../models/User');
const Post = require('../models/Post');
const { catchAsync, successResponse } = require('../utils/helpers');

exports.search = catchAsync(async (req, res) => {
  const { q, type = 'all', page = 1, limit = 20 } = req.query;
  if (!q || q.trim().length < 1) {
    return successResponse(res, 200, 'Search results.', { users: [], posts: [], hashtags: [] });
  }

  const skip = (page - 1) * limit;
  const blocked = req.user?.blockedUsers || [];
  const results = {};

  if (type === 'all' || type === 'users') {
    results.users = await User.find({
      $text: { $search: q },
      isActive: true,
      isBanned: false,
      _id: { $nin: blocked },
    })
      .select('name username avatar bio followersCount')
      .skip(skip)
      .limit(parseInt(limit));
  }

  if (type === 'all' || type === 'posts') {
    results.posts = await Post.find({
      $text: { $search: q },
      visibility: 'public',
      isDraft: false,
      isHidden: false,
      author: { $nin: blocked },
    })
      .populate('author', 'name username avatar')
      .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
  }

  if (type === 'all' || type === 'hashtags') {
    const tag = q.replace(/^#/, '').toLowerCase();
    results.hashtags = await Post.aggregate([
      { $match: { hashtags: tag, visibility: 'public', isDraft: false } },
      { $group: { _id: tag, count: { $sum: 1 } } },
    ]);
  }

  successResponse(res, 200, 'Search results.', results);
});

exports.searchByHashtag = catchAsync(async (req, res) => {
  const { tag } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const posts = await Post.find({ hashtags: tag.toLowerCase(), visibility: 'public', isDraft: false })
    .populate('author', 'name username avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  successResponse(res, 200, `Posts with #${tag}.`, { posts });
});

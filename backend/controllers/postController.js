const Post = require('../models/Post');
const User = require('../models/User');
const { Like, Follow, SavedPost } = require('../models');
const { AppError, catchAsync, successResponse, paginationMeta } = require('../utils/helpers');
const { createNotification } = require('../services/notificationService');
const { deleteMedia } = require('../config/cloudinary');

// ── CREATE POST ────────────────────────────────────────────────────────────────
exports.createPost = catchAsync(async (req, res, next) => {
  const { content, visibility, isDraft, location } = req.body;

  if (!content && (!req.files || req.files.length === 0)) {
    return next(new AppError('Post must have content or media.', 400));
  }

  const media = req.files
    ? req.files.map((f) => ({
        url: f.path,
        publicId: f.filename,
        type: f.mimetype.startsWith('video') ? 'video' : 'image',
      }))
    : [];

  const post = await Post.create({
    author: req.user._id,
    content,
    media,
    visibility: visibility || 'public',
    isDraft: isDraft === 'true',
    location: location ? JSON.parse(location) : undefined,
  });

  // Update post count
  if (!post.isDraft) {
    await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });
  }

  // Resolve mentions and notify
  if (post._mentionUsernames?.length) {
    const mentionedUsers = await User.find({ username: { $in: post._mentionUsernames } }).select('_id');
    post.mentions = mentionedUsers.map((u) => u._id);
    await post.save();

    for (const mentionedUser of mentionedUsers) {
      await createNotification(req.app.get('io'), {
        recipient: mentionedUser._id,
        sender: req.user._id,
        type: 'mention',
        post: post._id,
      });
    }
  }

  await post.populate('author', 'name username avatar');
  successResponse(res, 201, 'Post created.', { post });
});

// ── GET SINGLE POST ────────────────────────────────────────────────────────────
exports.getPost = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id)
    .populate('author', 'name username avatar settings.privacy')
    .populate('originalPost');

  if (!post || post.isHidden) return next(new AppError('Post not found.', 404));

  // Increment views
  await Post.findByIdAndUpdate(post._id, { $inc: { viewsCount: 1 } });

  // Check if current user liked this post
  let isLiked = false;
  let isSaved = false;
  if (req.user) {
    isLiked = !!(await Like.exists({ user: req.user._id, target: post._id, targetModel: 'Post' }));
    isSaved = !!(await SavedPost.exists({ user: req.user._id, post: post._id }));
  }

  const postData = post.toObject();
  postData.isLiked = isLiked;
  postData.isSaved = isSaved;

  successResponse(res, 200, 'Post fetched.', { post: postData });
});

// ── UPDATE POST ────────────────────────────────────────────────────────────────
exports.updatePost = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) return next(new AppError('Post not found.', 404));
  if (post.author.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized to edit this post.', 403));
  }

  const { content, visibility } = req.body;
  post.content = content ?? post.content;
  post.visibility = visibility ?? post.visibility;
  post.isEdited = true;
  post.editedAt = Date.now();
  await post.save();

  await post.populate('author', 'name username avatar');
  successResponse(res, 200, 'Post updated.', { post });
});

// ── DELETE POST ────────────────────────────────────────────────────────────────
exports.deletePost = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) return next(new AppError('Post not found.', 404));

  const isAuthor = post.author.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';
  if (!isAuthor && !isAdmin) return next(new AppError('Not authorized to delete this post.', 403));

  // Delete media from Cloudinary
  for (const m of post.media) {
    await deleteMedia(m.publicId, m.type === 'video' ? 'video' : 'image');
  }

  await post.deleteOne();
  if (!post.isDraft) {
    await User.findByIdAndUpdate(post.author, { $inc: { postsCount: -1 } });
  }

  successResponse(res, 200, 'Post deleted.');
});

// ── LIKE / UNLIKE ──────────────────────────────────────────────────────────────
exports.toggleLike = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) return next(new AppError('Post not found.', 404));

  const existing = await Like.findOne({ user: req.user._id, target: post._id, targetModel: 'Post' });

  if (existing) {
    await existing.deleteOne();
    await Post.findByIdAndUpdate(post._id, { $inc: { likesCount: -1 } });
    return successResponse(res, 200, 'Post unliked.', { liked: false, likesCount: post.likesCount - 1 });
  }

  await Like.create({ user: req.user._id, target: post._id, targetModel: 'Post' });
  await Post.findByIdAndUpdate(post._id, { $inc: { likesCount: 1 } });

  // Notify post author
  if (post.author.toString() !== req.user._id.toString()) {
    await createNotification(req.app.get('io'), {
      recipient: post.author,
      sender: req.user._id,
      type: 'like',
      post: post._id,
    });
  }

  successResponse(res, 200, 'Post liked.', { liked: true, likesCount: post.likesCount + 1 });
});

// ── SAVE / UNSAVE ──────────────────────────────────────────────────────────────
exports.toggleSave = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) return next(new AppError('Post not found.', 404));

  const existing = await SavedPost.findOne({ user: req.user._id, post: post._id });
  if (existing) {
    await existing.deleteOne();
    await Post.findByIdAndUpdate(post._id, { $inc: { savesCount: -1 } });
    return successResponse(res, 200, 'Post unsaved.', { saved: false });
  }

  await SavedPost.create({ user: req.user._id, post: post._id });
  await Post.findByIdAndUpdate(post._id, { $inc: { savesCount: 1 } });
  successResponse(res, 200, 'Post saved.', { saved: true });
});

// ── REPOST ─────────────────────────────────────────────────────────────────────
exports.repost = catchAsync(async (req, res, next) => {
  const originalPost = await Post.findById(req.params.id);
  if (!originalPost) return next(new AppError('Post not found.', 404));

  const { content } = req.body;
  const type = content ? 'quote' : 'repost';

  const repost = await Post.create({
    author: req.user._id,
    type,
    originalPost: originalPost._id,
    content: content || '',
    visibility: 'public',
  });

  await Post.findByIdAndUpdate(originalPost._id, { $inc: { sharesCount: 1 } });
  await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });

  await createNotification(req.app.get('io'), {
    recipient: originalPost.author,
    sender: req.user._id,
    type: 'repost',
    post: originalPost._id,
  });

  await repost.populate('author', 'name username avatar');
  successResponse(res, 201, `${type === 'quote' ? 'Quote' : 'Re'}post created.`, { post: repost });
});

// ── PIN POST ───────────────────────────────────────────────────────────────────
exports.togglePin = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) return next(new AppError('Post not found.', 404));
  if (post.author.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized.', 403));
  }

  // Unpin any existing pinned post
  await Post.updateMany({ author: req.user._id, isPinned: true }, { isPinned: false });

  if (!post.isPinned) {
    post.isPinned = true;
    await post.save();
    await User.findByIdAndUpdate(req.user._id, { pinnedPost: post._id });
    return successResponse(res, 200, 'Post pinned.', { isPinned: true });
  }

  await User.findByIdAndUpdate(req.user._id, { pinnedPost: null });
  successResponse(res, 200, 'Post unpinned.', { isPinned: false });
});

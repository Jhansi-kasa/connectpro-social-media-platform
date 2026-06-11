const Comment = require('../models/Comment');
const Post = require('../models/Post');
const { Like } = require('../models');
const { AppError, catchAsync, successResponse, paginationMeta } = require('../utils/helpers');
const { createNotification } = require('../services/notificationService');

const getComments = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    Comment.find({ post: postId, parent: null, isHidden: false })
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Comment.countDocuments({ post: postId, parent: null, isHidden: false }),
  ]);

  successResponse(res, 200, 'Comments fetched.', { comments }, paginationMeta(total, page, limit));
});

const getReplies = catchAsync(async (req, res) => {
  const { commentId } = req.params;
  const replies = await Comment.find({ parent: commentId, isHidden: false })
    .populate('author', 'name username avatar')
    .sort({ createdAt: 1 });
  successResponse(res, 200, 'Replies fetched.', { replies });
});

const createComment = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const { content, parentId } = req.body;

  const post = await Post.findById(postId);
  if (!post) return next(new AppError('Post not found.', 404));

  let depth = 0;
  if (parentId) {
    const parent = await Comment.findById(parentId);
    if (!parent) return next(new AppError('Parent comment not found.', 404));
    depth = Math.min(parent.depth + 1, 2);
  }

  const comment = await Comment.create({
    post: postId,
    author: req.user._id,
    content,
    parent: parentId || null,
    depth,
  });

  await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } });
  if (parentId) await Comment.findByIdAndUpdate(parentId, { $inc: { repliesCount: 1 } });

  const notifyTarget = parentId
    ? (await Comment.findById(parentId))?.author
    : post.author;

  if (notifyTarget) {
    await createNotification(req.app.get('io'), {
      recipient: notifyTarget,
      sender: req.user._id,
      type: parentId ? 'reply' : 'comment',
      post: postId,
      comment: comment._id,
    });
  }

  await comment.populate('author', 'name username avatar');
  successResponse(res, 201, 'Comment created.', { comment });
});

const updateComment = catchAsync(async (req, res, next) => {
  const comment = await Comment.findById(req.params.commentId);
  if (!comment) return next(new AppError('Comment not found.', 404));
  if (comment.author.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized.', 403));
  }
  comment.content = req.body.content;
  comment.isEdited = true;
  comment.editedAt = Date.now();
  await comment.save();
  successResponse(res, 200, 'Comment updated.', { comment });
});

const deleteComment = catchAsync(async (req, res, next) => {
  const comment = await Comment.findById(req.params.commentId);
  if (!comment) return next(new AppError('Comment not found.', 404));

  const isAuthor = comment.author.toString() === req.user._id.toString();
  const isAdmin = ['admin', 'moderator'].includes(req.user.role);
  if (!isAuthor && !isAdmin) return next(new AppError('Not authorized.', 403));

  await comment.deleteOne();
  await Post.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -1 } });
  if (comment.parent) await Comment.findByIdAndUpdate(comment.parent, { $inc: { repliesCount: -1 } });

  successResponse(res, 200, 'Comment deleted.');
});

const toggleCommentLike = catchAsync(async (req, res, next) => {
  const comment = await Comment.findById(req.params.commentId);
  if (!comment) return next(new AppError('Comment not found.', 404));

  const existing = await Like.findOne({ user: req.user._id, target: comment._id, targetModel: 'Comment' });
  if (existing) {
    await existing.deleteOne();
    await Comment.findByIdAndUpdate(comment._id, { $inc: { likesCount: -1 } });
    return successResponse(res, 200, 'Comment unliked.', { liked: false });
  }
  await Like.create({ user: req.user._id, target: comment._id, targetModel: 'Comment' });
  await Comment.findByIdAndUpdate(comment._id, { $inc: { likesCount: 1 } });
  successResponse(res, 200, 'Comment liked.', { liked: true });
});

module.exports = {
  commentController: {
    getComments,
    getReplies,
    createComment,
    updateComment,
    deleteComment,
    toggleCommentLike,
  },
};

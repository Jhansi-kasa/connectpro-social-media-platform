const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { commentController } = require('../controllers/commentController');
const { protect, optionalAuth } = require('../middleware/auth');
const { createPostValidator, createCommentValidator, paginationValidator } = require('../middleware/validators');
const { uploadPost } = require('../config/cloudinary');

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/:id', optionalAuth, postController.getPost);
router.get('/:postId/comments', optionalAuth, paginationValidator, commentController.getComments);

// ── Protected ─────────────────────────────────────────────────────────────────
router.post('/', protect, uploadPost.array('media', 10), createPostValidator, postController.createPost);
router.put('/:id', protect, postController.updatePost);
router.delete('/:id', protect, postController.deletePost);
router.post('/:id/like', protect, postController.toggleLike);
router.post('/:id/save', protect, postController.toggleSave);
router.post('/:id/repost', protect, postController.repost);
router.put('/:id/pin', protect, postController.togglePin);
router.post('/:postId/comments', protect, createCommentValidator, commentController.createComment);

module.exports = router;

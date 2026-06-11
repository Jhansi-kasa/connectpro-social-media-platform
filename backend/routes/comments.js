const express = require('express');
const router = express.Router();
const { commentController } = require('../controllers/commentController');
const { protect } = require('../middleware/auth');
const { createCommentValidator } = require('../middleware/validators');

router.use(protect);
router.get('/:commentId/replies', commentController.getReplies);
router.put('/:commentId', createCommentValidator, commentController.updateComment);
router.delete('/:commentId', commentController.deleteComment);
router.post('/:commentId/like', commentController.toggleCommentLike);

module.exports = router;

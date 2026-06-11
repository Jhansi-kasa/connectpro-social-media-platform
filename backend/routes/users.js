const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, optionalAuth } = require('../middleware/auth');
const { updateProfileValidator } = require('../middleware/validators');
const { uploadAvatar, uploadCover } = require('../config/cloudinary');

// ── Protected /me routes FIRST (before /:username catches them) ───────────────
router.use('/me', protect);
router.put('/me/profile', updateProfileValidator, userController.updateProfile);
router.put('/me/avatar', uploadAvatar.single('avatar'), userController.uploadAvatar);
router.put('/me/cover', uploadCover.single('cover'), userController.uploadCoverPhoto);
router.get('/me/saved', userController.getSavedPosts);
router.get('/me/blocked', userController.getBlockedUsers);
router.put('/me/deactivate', userController.deactivateAccount);
router.delete('/me/delete', userController.deleteAccount);

// ── Suggestions ───────────────────────────────────────────────────────────────
router.get('/suggestions', protect, userController.getSuggestedUsers);

// ── Block / Unblock ───────────────────────────────────────────────────────────
router.post('/:userId/block', protect, userController.blockUser);
router.delete('/:userId/block', protect, userController.unblockUser);

// ── Public profile routes (/:username must be LAST) ───────────────────────────
router.get('/:username/posts', optionalAuth, userController.getUserPosts);
router.get('/:username', optionalAuth, userController.getProfile);

module.exports = router;

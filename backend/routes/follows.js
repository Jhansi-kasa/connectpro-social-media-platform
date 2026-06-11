const express = require('express');
const router = express.Router();
const followController = require('../controllers/followController');
const { protect, optionalAuth } = require('../middleware/auth');

// ── Protected /me routes FIRST ────────────────────────────────────────────────
router.get('/me/requests', protect, followController.getPendingRequests);
router.post('/requests/:followerId/accept', protect, followController.acceptFollowRequest);
router.delete('/requests/:followerId/decline', protect, followController.declineFollowRequest);
router.post('/:userId/toggle', protect, followController.toggleFollow);

// ── Public (/:username must be last) ──────────────────────────────────────────
router.get('/:username/followers', optionalAuth, followController.getFollowers);
router.get('/:username/following', optionalAuth, followController.getFollowing);

module.exports = router;

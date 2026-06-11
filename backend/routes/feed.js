const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feedController');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/home', protect, feedController.getHomeFeed);
router.get('/explore', optionalAuth, feedController.getExploreFeed);
router.get('/trending', feedController.getTrendingHashtags);

module.exports = router;

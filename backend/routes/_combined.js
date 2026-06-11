// search.js
const express = require('express');
const searchRouter = express.Router();
const searchController = require('../controllers/searchController');
const { optionalAuth } = require('../middleware/auth');
searchRouter.get('/', optionalAuth, searchController.search);
searchRouter.get('/hashtag/:tag', optionalAuth, searchController.searchByHashtag);

// feed.js
const feedRouter = express.Router();
const feedController = require('../controllers/feedController');
const { protect, optionalAuth: optAuth } = require('../middleware/auth');
feedRouter.get('/home', protect, feedController.getHomeFeed);
feedRouter.get('/explore', optAuth, feedController.getExploreFeed);
feedRouter.get('/trending', feedController.getTrendingHashtags);

// settings.js
const settingsRouter = express.Router();
const settingsController = require('../controllers/settingsController');
settingsRouter.use(protect);
settingsRouter.get('/', settingsController.getSettings);
settingsRouter.put('/privacy', settingsController.updatePrivacy);
settingsRouter.put('/notifications', settingsController.updateNotificationSettings);
settingsRouter.put('/theme', settingsController.updateTheme);
settingsRouter.put('/language', settingsController.updateLanguage);
settingsRouter.put('/email', settingsController.updateEmail);

// admin.js
const adminRouter = express.Router();
const adminController = require('../controllers/adminController');
const { authorize } = require('../middleware/auth');
adminRouter.use(protect, authorize('admin', 'moderator'));
adminRouter.get('/dashboard', adminController.getDashboard);
adminRouter.get('/users', adminController.getUsers);
adminRouter.put('/users/:userId/ban', authorize('admin'), adminController.banUser);
adminRouter.put('/users/:userId/unban', authorize('admin'), adminController.unbanUser);
adminRouter.get('/reports', adminController.getReports);
adminRouter.put('/reports/:reportId/resolve', adminController.resolveReport);

// report (public-ish, for authenticated users)
adminRouter.post('/report', protect, adminController.createReport);

module.exports = {
  searchRouter,
  feedRouter,
  settingsRouter,
  adminRouter,
};

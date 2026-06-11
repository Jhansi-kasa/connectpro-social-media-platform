const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// Any logged-in user can submit a report
router.post('/report', protect, adminController.createReport);

// Admin + moderator only
router.get('/dashboard', protect, authorize('admin', 'moderator'), adminController.getDashboard);
router.get('/users', protect, authorize('admin', 'moderator'), adminController.getUsers);
router.get('/reports', protect, authorize('admin', 'moderator'), adminController.getReports);
router.put('/reports/:reportId/resolve', protect, authorize('admin', 'moderator'), adminController.resolveReport);

// Admin only
router.put('/users/:userId/ban', protect, authorize('admin'), adminController.banUser);
router.put('/users/:userId/unban', protect, authorize('admin'), adminController.unbanUser);

module.exports = router;

const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', settingsController.getSettings);
router.put('/privacy', settingsController.updatePrivacy);
router.put('/notifications', settingsController.updateNotificationSettings);
router.put('/theme', settingsController.updateTheme);
router.put('/language', settingsController.updateLanguage);
router.put('/email', settingsController.updateEmail);

module.exports = router;

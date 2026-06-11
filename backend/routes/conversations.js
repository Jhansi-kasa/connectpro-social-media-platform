const express = require('express');
const convRouter = express.Router();
const msgRouter = express.Router();
const messageController = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const { uploadMessage } = require('../config/cloudinary');
const { sendMessageValidator } = require('../middleware/validators');

// ── Conversation routes ────────────────────────────────────────────────────────
convRouter.get('/', protect, messageController.getConversations);
convRouter.post('/group', protect, messageController.createGroupConversation);
convRouter.get('/with/:userId', protect, messageController.getOrCreateConversation);
convRouter.delete('/:id', protect, messageController.deleteConversation);
convRouter.get('/:conversationId/messages', protect, messageController.getMessages);
convRouter.post('/:conversationId/messages', protect, uploadMessage.single('file'), sendMessageValidator, messageController.sendMessage);

// ── Message routes ─────────────────────────────────────────────────────────────
msgRouter.delete('/:messageId', protect, messageController.deleteMessage);

module.exports = { convRouter, msgRouter };

const { Conversation, Message } = require('../models');
const User = require('../models/User');
const { AppError, catchAsync, successResponse, paginationMeta } = require('../utils/helpers');
const { deleteMedia } = require('../config/cloudinary');

// ── CONVERSATIONS ─────────────────────────────────────────────────────────────
exports.getConversations = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const conversations = await Conversation.find({ participants: userId })
    .populate('participants', 'name username avatar isOnline lastSeen')
    .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'name username' } })
    .sort({ lastMessageAt: -1 });

  // Filter out ones deleted by user and format for client
  const filtered = conversations
    .filter((c) => {
      const deletedEntry = c.deletedFor?.find((d) => d.user.toString() === userId.toString());
      if (!deletedEntry) return true;
      return c.lastMessageAt > deletedEntry.deletedAt;
    })
    .map((c) => {
      const other = c.participants.filter((p) => p._id.toString() !== userId.toString());
      return {
        ...c.toObject(),
        otherParticipants: other,
      };
    });

  successResponse(res, 200, 'Conversations fetched.', { conversations: filtered });
});

exports.getOrCreateConversation = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  if (userId === req.user._id.toString()) return next(new AppError('Cannot message yourself.', 400));

  const target = await User.findById(userId);
  if (!target) return next(new AppError('User not found.', 404));

  // Check messaging privacy
  const allowFrom = target.settings?.privacy?.allowMessagesFrom;
  if (allowFrom === 'none') return next(new AppError('This user has disabled messages.', 403));

  let conversation = await Conversation.findOne({
    participants: { $all: [req.user._id, userId], $size: 2 },
    isGroup: false,
  }).populate('participants', 'name username avatar isOnline lastSeen');

  if (!conversation) {
    conversation = await Conversation.create({ participants: [req.user._id, userId] });
    conversation = await Conversation.findById(conversation._id).populate('participants', 'name username avatar isOnline lastSeen');
  }

  successResponse(res, 200, 'Conversation ready.', { conversation });
});

exports.createGroupConversation = catchAsync(async (req, res, next) => {
  const { participantIds, groupName } = req.body;
  if (!participantIds?.length || participantIds.length < 2) {
    return next(new AppError('Group chat requires at least 2 other participants.', 400));
  }

  const allParticipants = [...new Set([req.user._id.toString(), ...participantIds])];
  const conversation = await Conversation.create({
    participants: allParticipants,
    isGroup: true,
    groupName: groupName || 'Group Chat',
    admin: req.user._id,
  });

  await conversation.populate('participants', 'name username avatar');
  successResponse(res, 201, 'Group conversation created.', { conversation });
});

exports.deleteConversation = catchAsync(async (req, res) => {
  await Conversation.findByIdAndUpdate(req.params.id, {
    $push: { deletedFor: { user: req.user._id, deletedAt: Date.now() } },
  });
  successResponse(res, 200, 'Conversation deleted.');
});

// ── MESSAGES ─────────────────────────────────────────────────────────────────
exports.getMessages = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 30 } = req.query;

  const conversation = await Conversation.findOne({ _id: conversationId, participants: req.user._id });
  if (!conversation) return next(new AppError('Conversation not found.', 404));

  const skip = (page - 1) * limit;
  const userDeletedAt = conversation.deletedFor?.find((d) => d.user.toString() === req.user._id.toString())?.deletedAt;

  const filter = {
    conversation: conversationId,
    isDeleted: false,
    ...(userDeletedAt && { createdAt: { $gt: userDeletedAt } }),
  };

  const [messages, total] = await Promise.all([
    Message.find(filter)
      .populate('sender', 'name username avatar')
      .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name username' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Message.countDocuments(filter),
  ]);

  // Mark messages as read
  await Message.updateMany(
    { conversation: conversationId, 'readBy.user': { $ne: req.user._id }, sender: { $ne: req.user._id } },
    { $push: { readBy: { user: req.user._id, readAt: Date.now() } } }
  );

  successResponse(res, 200, 'Messages fetched.', { messages: messages.reverse() }, paginationMeta(total, page, limit));
});

exports.sendMessage = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { content, replyTo } = req.body;

  const conversation = await Conversation.findOne({ _id: conversationId, participants: req.user._id });
  if (!conversation) return next(new AppError('Conversation not found.', 404));

  if (!content && !req.file) return next(new AppError('Message must have content or media.', 400));

  const messageData = {
    conversation: conversationId,
    sender: req.user._id,
    content: content || '',
    replyTo: replyTo || null,
  };

  if (req.file) {
    messageData.media = {
      url: req.file.path,
      publicId: req.file.filename,
      type: req.file.mimetype.startsWith('video') ? 'video' : req.file.mimetype.startsWith('audio') ? 'audio' : 'image',
      name: req.file.originalname,
      size: req.file.size,
    };
  }

  const message = await Message.create(messageData);
  await message.populate('sender', 'name username avatar');

  // Update conversation
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: message._id,
    lastMessageAt: Date.now(),
  });

  // Emit to conversation room via socket
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversationId}`).emit('message:new', message);
  }

  successResponse(res, 201, 'Message sent.', { message });
});

exports.deleteMessage = catchAsync(async (req, res, next) => {
  const message = await Message.findById(req.params.messageId);
  if (!message) return next(new AppError('Message not found.', 404));
  if (message.sender.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized.', 403));
  }

  if (message.media?.publicId) await deleteMedia(message.media.publicId);

  message.isDeleted = true;
  message.content = '';
  message.media = undefined;
  message.deletedAt = Date.now();
  await message.save();

  const io = req.app.get('io');
  if (io) io.to(`conversation:${message.conversation}`).emit('message:deleted', { messageId: message._id });

  successResponse(res, 200, 'Message deleted.');
});

const mongoose = require('mongoose');

// ──────────────────────────────────────────
// LIKE
// ──────────────────────────────────────────
const LikeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    target: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'targetModel' },
    targetModel: { type: String, required: true, enum: ['Post', 'Comment'] },
  },
  { timestamps: true }
);
LikeSchema.index({ user: 1, target: 1, targetModel: 1 }, { unique: true });
LikeSchema.index({ target: 1, targetModel: 1 });
const Like = mongoose.model('Like', LikeSchema);

// ──────────────────────────────────────────
// FOLLOW
// ──────────────────────────────────────────
const FollowSchema = new mongoose.Schema(
  {
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'accepted' }, // pending for private accounts
  },
  { timestamps: true }
);
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });
FollowSchema.index({ follower: 1 });
FollowSchema.index({ following: 1 });
const Follow = mongoose.model('Follow', FollowSchema);

// ──────────────────────────────────────────
// NOTIFICATION
// ──────────────────────────────────────────
const NotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      required: true,
      enum: ['like', 'comment', 'follow', 'follow_request', 'mention', 'reply', 'repost', 'message', 'system'],
    },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
    isRead: { type: Boolean, default: false },
    message: { type: String }, // custom message for system notifications
  },
  { timestamps: true }
);
NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
const Notification = mongoose.model('Notification', NotificationSchema);

// ──────────────────────────────────────────
// CONVERSATION
// ──────────────────────────────────────────
const ConversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    isGroup: { type: Boolean, default: false },
    groupName: String,
    groupAvatar: {
      url: String,
      publicId: String,
    },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // for group chats
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    lastMessageAt: { type: Date, default: Date.now },
    // Per-user delete timestamp
    deletedFor: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        deletedAt: Date,
      },
    ],
  },
  { timestamps: true }
);
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
const Conversation = mongoose.model('Conversation', ConversationSchema);

// ──────────────────────────────────────────
// MESSAGE
// ──────────────────────────────────────────
const MessageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    media: {
      url: String,
      publicId: String,
      type: { type: String, enum: ['image', 'video', 'file', 'audio'] },
      name: String,
      size: Number,
    },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);
MessageSchema.index({ conversation: 1, createdAt: -1 });
const Message = mongoose.model('Message', MessageSchema);

// ──────────────────────────────────────────
// REPORT
// ──────────────────────────────────────────
const ReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    target: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'targetModel' },
    targetModel: { type: String, required: true, enum: ['Post', 'Comment', 'User'] },
    reason: {
      type: String,
      required: true,
      enum: ['spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'false_information', 'scam', 'other'],
    },
    description: { type: String, maxlength: 500 },
    status: { type: String, enum: ['pending', 'reviewed', 'resolved', 'dismissed'], default: 'pending' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    resolution: String,
  },
  { timestamps: true }
);
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ reporter: 1, target: 1, targetModel: 1 });
const Report = mongoose.model('Report', ReportSchema);

// ──────────────────────────────────────────
// SAVED POST
// ──────────────────────────────────────────
const SavedPostSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    collectionName: { type: String, default: 'All' },
  },
  { timestamps: true }
);
SavedPostSchema.index({ user: 1, post: 1 }, { unique: true });
SavedPostSchema.index({ user: 1, createdAt: -1 });
const SavedPost = mongoose.model('SavedPost', SavedPostSchema);

module.exports = { Like, Follow, Notification, Conversation, Message, Report, SavedPost };

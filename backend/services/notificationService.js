const { Notification } = require('../models');
const User = require('../models/User');

/**
 * Create a notification and emit via socket if available
 */
const createNotification = async (io, { recipient, sender, type, post, comment, message }) => {
  try {
    // Don't notify yourself
    if (recipient.toString() === sender?.toString()) return null;

    // Check recipient's notification settings
    const recipientUser = await User.findById(recipient).select('settings.notifications isActive');
    if (!recipientUser?.isActive) return null;

    const ns = recipientUser.settings?.notifications;
    const shouldNotify =
      (type === 'like' && ns?.likes !== false) ||
      (type === 'comment' && ns?.comments !== false) ||
      (type === 'follow' && ns?.follows !== false) ||
      (type === 'message' && ns?.messages !== false) ||
      (type === 'mention' && ns?.mentions !== false) ||
      !['like', 'comment', 'follow', 'message', 'mention'].includes(type);

    if (!shouldNotify) return null;

    const notification = await Notification.create({
      recipient,
      sender,
      type,
      post,
      comment,
      message,
    });

    const populated = await Notification.findById(notification._id)
      .populate('sender', 'name username avatar')
      .populate('post', 'content media');

    // Emit to recipient via socket
    if (io) {
      io.to(`user:${recipient}`).emit('notification:new', populated);
    }

    return populated;
  } catch (err) {
    console.error('createNotification error:', err.message);
    return null;
  }
};

module.exports = { createNotification };

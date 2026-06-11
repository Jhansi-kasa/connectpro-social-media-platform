const { Notification } = require('../models');
const { catchAsync, successResponse, paginationMeta } = require('../utils/helpers');

exports.getNotifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ recipient: req.user._id })
      .populate('sender', 'name username avatar')
      .populate('post', 'content media')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Notification.countDocuments({ recipient: req.user._id }),
    Notification.countDocuments({ recipient: req.user._id, isRead: false }),
  ]);

  successResponse(res, 200, 'Notifications fetched.', { notifications, unreadCount }, paginationMeta(total, page, limit));
});

exports.markAllRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
  successResponse(res, 200, 'All notifications marked as read.');
});

exports.markRead = catchAsync(async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true }
  );
  successResponse(res, 200, 'Notification marked as read.');
});

exports.deleteNotification = catchAsync(async (req, res) => {
  await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
  successResponse(res, 200, 'Notification deleted.');
});

exports.getUnreadCount = catchAsync(async (req, res) => {
  const count = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
  successResponse(res, 200, 'Unread count.', { count });
});

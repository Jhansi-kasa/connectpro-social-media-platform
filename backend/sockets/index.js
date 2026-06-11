const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Track online users: userId -> Set of socketIds
const onlineUsers = new Map();

const initSocket = (io) => {
  // Authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('name username avatar isActive isBanned');

      if (!user || !user.isActive || user.isBanned) {
        return next(new Error('User not authorized'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`Socket connected: ${socket.user.username} (${socket.id})`);

    // Track online status
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    // Update DB
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: Date.now() });

    // Join personal room for notifications
    socket.join(`user:${userId}`);

    // Notify others that user is online
    socket.broadcast.emit('user:online', { userId });

    // ── JOIN CONVERSATION ──────────────────────────────────────────────────────
    socket.on('conversation:join', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
      logger.info(`${socket.user.username} joined conversation ${conversationId}`);
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // ── TYPING INDICATORS ──────────────────────────────────────────────────────
    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        userId,
        username: socket.user.username,
        conversationId,
      });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        userId,
        conversationId,
      });
    });

    // ── MESSAGE READ RECEIPT ───────────────────────────────────────────────────
    socket.on('message:read', ({ conversationId, messageId }) => {
      socket.to(`conversation:${conversationId}`).emit('message:read', {
        userId,
        conversationId,
        messageId,
        readAt: new Date(),
      });
    });

    // ── DISCONNECT ─────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
          socket.broadcast.emit('user:offline', { userId, lastSeen });
        }
      }
      logger.info(`Socket disconnected: ${socket.user.username} (${socket.id})`);
    });
  });
};

const getOnlineUsers = () => [...onlineUsers.keys()];
const isUserOnline = (userId) => onlineUsers.has(userId.toString());

module.exports = { initSocket, getOnlineUsers, isUserOnline };

/**
 * ConnectPro API Client
 * Connects the existing frontend UI to the Node.js/Express backend
 */

const API_BASE = 'https://connectpro-social-media-platform.onrender.com/api';

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────
const request = async (method, endpoint, data = null, isFormData = false) => {
  const token = localStorage.getItem('accessToken');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData && data) headers['Content-Type'] = 'application/json';

  const config = {
    method,
    headers,
    credentials: 'include',
    body: isFormData ? data : data ? JSON.stringify(data) : undefined,
  };

  try {
    let res = await fetch(`${API_BASE}${endpoint}`, config);

    // Auto-refresh token on 401
    if (res.status === 401 && endpoint !== '/auth/login') {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
        res = await fetch(`${API_BASE}${endpoint}`, { ...config, headers });
      } else {
        window.location.href = 'index.html';
        return;
      }
    }

    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Request failed');
    return json;
  } catch (err) {
    showToast(err.message || 'Network error', 'error');
    throw err;
  }
};

const get = (url) => request('GET', url);
const post = (url, data, isForm = false) => request('POST', url, data, isForm);
const put = (url, data, isForm = false) => request('PUT', url, data, isForm);
const del = (url, data) => request('DELETE', url, data);

// ─── TOKEN MANAGEMENT ─────────────────────────────────────────────────────────
const refreshAccessToken = async () => {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh-token`, {
      method: 'POST',
      credentials: 'include',
    });
    const json = await res.json();
    if (json.success) {
      localStorage.setItem('accessToken', json.data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};
const setStoredUser = (user) => localStorage.setItem('user', JSON.stringify(user));
const clearAuth = () => { localStorage.removeItem('accessToken'); localStorage.removeItem('user'); };

// ─── TOAST NOTIFICATION ───────────────────────────────────────────────────────
const showToast = (message, type = 'success') => {
  const existing = document.querySelector('.cp-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `cp-toast cp-toast--${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:12px 20px; border-radius:10px; font-size:14px;
    background:${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#22c55e'};
    color:#fff; box-shadow:0 4px 12px rgba(0,0,0,0.2);
    animation:slideIn 0.3s ease; max-width:300px;
  `;

  if (!document.querySelector('#cp-toast-style')) {
    const s = document.createElement('style');
    s.id = 'cp-toast-style';
    s.textContent = `@keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`;
    document.head.appendChild(s);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

// ─── AUTH API ─────────────────────────────────────────────────────────────────
const Auth = {
  async register(name, username, email, password) {
    const res = await post('/auth/register', { name, username, email, password });
    localStorage.setItem('accessToken', res.data.accessToken);
    setStoredUser(res.data.user);
    showToast('Account created! Please verify your email.');
    return res;
  },

  async login(email, password) {
    const res = await post('/auth/login', { email, password });
    localStorage.setItem('accessToken', res.data.accessToken);
    setStoredUser(res.data.user);
    showToast(`Welcome back, ${res.data.user.name}!`);
    return res;
  },

  async logout() {
    try { await post('/auth/logout'); } catch (_) {}
    clearAuth();
    window.location.href = 'index.html';
  },

  async getMe() {
    const res = await get('/auth/me');
    setStoredUser(res.data.user);
    return res.data.user;
  },

  async forgotPassword(email) {
    const res = await post('/auth/forgot-password', { email });
    showToast(res.message);
    return res;
  },

  async resetPassword(token, password, confirmPassword) {
    const res = await put(`/auth/reset-password/${token}`, { password, confirmPassword });
    showToast('Password reset! Please log in.');
    return res;
  },

  async changePassword(currentPassword, newPassword, confirmPassword) {
    const res = await put('/auth/change-password', { currentPassword, newPassword, confirmPassword });
    showToast('Password changed successfully.');
    clearAuth();
    window.location.href = 'index.html';
    return res;
  },
};

// ─── USERS API ────────────────────────────────────────────────────────────────
const Users = {
  async getProfile(username) {
    const res = await get(`/users/${username}`);
    return res.data.user;
  },

  async updateProfile(data) {
    const res = await put('/users/me/profile', data);
    setStoredUser(res.data.user);
    showToast('Profile updated!');
    return res.data.user;
  },

  async uploadAvatar(file) {
    const form = new FormData();
    form.append('avatar', file);
    const res = await put('/users/me/avatar', form, true);
    showToast('Profile photo updated!');
    return res.data.avatar;
  },

  async uploadCover(file) {
    const form = new FormData();
    form.append('cover', file);
    const res = await put('/users/me/cover', form, true);
    showToast('Cover photo updated!');
    return res.data.coverPhoto;
  },

  async getUserPosts(username, page = 1) {
    const res = await get(`/users/${username}/posts?page=${page}&limit=12`);
    return res;
  },

  async getSavedPosts(page = 1) {
    const res = await get(`/users/me/saved?page=${page}`);
    return res;
  },

  async getSuggestions(limit = 5) {
    const res = await get(`/users/suggestions?limit=${limit}`);
    return res.data.users;
  },

  async blockUser(userId) {
    const res = await post(`/users/${userId}/block`);
    showToast('User blocked.');
    return res;
  },

  async unblockUser(userId) {
    const res = await del(`/users/${userId}/block`);
    showToast('User unblocked.');
    return res;
  },

  async getBlockedUsers() {
    const res = await get('/users/me/blocked');
    return res.data.users;
  },

  async deactivateAccount() {
    await put('/users/me/deactivate');
    clearAuth();
    window.location.href = 'index.html';
  },

  async deleteAccount(password) {
    await del('/users/me/delete', { password });
    clearAuth();
    showToast('Account deleted.', 'warning');
    window.location.href = 'index.html';
  },
};

// ─── POSTS API ────────────────────────────────────────────────────────────────
const Posts = {
  async create(content, files = [], visibility = 'public') {
    const form = new FormData();
    form.append('content', content);
    form.append('visibility', visibility);
    files.forEach((f) => form.append('media', f));
    const res = await post('/posts', form, true);
    showToast('Post created!');
    return res.data.post;
  },

  async getPost(id) {
    const res = await get(`/posts/${id}`);
    return res.data.post;
  },

  async update(id, content, visibility) {
    const res = await put(`/posts/${id}`, { content, visibility });
    showToast('Post updated!');
    return res.data.post;
  },

  async delete(id) {
    await del(`/posts/${id}`);
    showToast('Post deleted.');
  },

  async toggleLike(id) {
    const res = await post(`/posts/${id}/like`);
    return res.data;
  },

  async toggleSave(id) {
    const res = await post(`/posts/${id}/save`);
    return res.data;
  },

  async repost(id, content = '') {
    const res = await post(`/posts/${id}/repost`, { content });
    showToast(content ? 'Quote posted!' : 'Reposted!');
    return res.data.post;
  },

  async togglePin(id) {
    const res = await put(`/posts/${id}/pin`);
    showToast(res.data.isPinned ? 'Post pinned!' : 'Post unpinned.');
    return res.data;
  },

  async getComments(postId, page = 1) {
    const res = await get(`/posts/${postId}/comments?page=${page}`);
    return res;
  },

  async createComment(postId, content, parentId = null) {
    const res = await post(`/posts/${postId}/comments`, { content, parentId });
    return res.data.comment;
  },
};

// ─── FEED API ─────────────────────────────────────────────────────────────────
const Feed = {
  async getHome(page = 1) {
    const res = await get(`/feed/home?page=${page}&limit=20`);
    return res;
  },

  async getExplore(page = 1) {
    const res = await get(`/feed/explore?page=${page}&limit=20`);
    return res;
  },

  async getTrending() {
    const res = await get('/feed/trending');
    return res.data.hashtags;
  },
};

// ─── FOLLOWS API ──────────────────────────────────────────────────────────────
const Follows = {
  async toggle(userId) {
    const res = await post(`/follows/${userId}/toggle`);
    return res.data;
  },

  async getFollowers(username, page = 1) {
    const res = await get(`/follows/${username}/followers?page=${page}`);
    return res;
  },

  async getFollowing(username, page = 1) {
    const res = await get(`/follows/${username}/following?page=${page}`);
    return res;
  },

  async getPendingRequests() {
    const res = await get('/follows/me/requests');
    return res.data.requests;
  },

  async acceptRequest(followerId) {
    await post(`/follows/requests/${followerId}/accept`);
    showToast('Follow request accepted.');
  },

  async declineRequest(followerId) {
    await del(`/follows/requests/${followerId}/decline`);
    showToast('Follow request declined.');
  },
};

// ─── NOTIFICATIONS API ────────────────────────────────────────────────────────
const Notifications = {
  async getAll(page = 1) {
    const res = await get(`/notifications?page=${page}`);
    return res;
  },

  async getUnreadCount() {
    const res = await get('/notifications/unread-count');
    return res.data.count;
  },

  async markAllRead() {
    await put('/notifications/read-all');
  },

  async markRead(id) {
    await put(`/notifications/${id}/read`);
  },

  async delete(id) {
    await del(`/notifications/${id}`);
  },
};

// ─── MESSAGES API ─────────────────────────────────────────────────────────────
const Messages = {
  async getConversations() {
    const res = await get('/conversations');
    return res.data.conversations;
  },

  async getOrCreate(userId) {
    const res = await get(`/conversations/with/${userId}`);
    return res.data.conversation;
  },

  async createGroup(participantIds, groupName) {
    const res = await post('/conversations/group', { participantIds, groupName });
    return res.data.conversation;
  },

  async getMessages(conversationId, page = 1) {
    const res = await get(`/conversations/${conversationId}/messages?page=${page}&limit=30`);
    return res;
  },

  async send(conversationId, content, file = null, replyTo = null) {
    if (file) {
      const form = new FormData();
      if (content) form.append('content', content);
      form.append('file', file);
      if (replyTo) form.append('replyTo', replyTo);
      return await post(`/conversations/${conversationId}/messages`, form, true);
    }
    const res = await post(`/conversations/${conversationId}/messages`, { content, replyTo });
    return res.data.message;
  },

  async deleteMessage(messageId) {
    await del(`/messages/${messageId}`);
  },

  async deleteConversation(conversationId) {
    await del(`/conversations/${conversationId}`);
    showToast('Conversation deleted.');
  },
};

// ─── SEARCH API ───────────────────────────────────────────────────────────────
const Search = {
  async search(q, type = 'all', page = 1) {
    const res = await get(`/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`);
    return res.data;
  },

  async byHashtag(tag, page = 1) {
    const res = await get(`/search/hashtag/${tag}?page=${page}`);
    return res.data;
  },
};

// ─── SETTINGS API ────────────────────────────────────────────────────────────
const Settings = {
  async get() {
    const res = await get('/settings');
    return res.data;
  },

  async updatePrivacy(data) {
    const res = await put('/settings/privacy', data);
    showToast('Privacy settings saved.');
    return res.data;
  },

  async updateNotifications(data) {
    const res = await put('/settings/notifications', data);
    showToast('Notification preferences saved.');
    return res.data;
  },

  async updateTheme(theme) {
    const res = await put('/settings/theme', { theme });
    showToast(`Theme set to ${theme}.`);
    return res.data;
  },

  async updateEmail(email, password) {
    const res = await put('/settings/email', { email, password });
    showToast('Email updated. Please verify your new email.');
    return res;
  },
};

// ─── REPORTS API ─────────────────────────────────────────────────────────────
const Reports = {
  async create(targetId, targetModel, reason, description = '') {
    const res = await post('/admin/report', { targetId, targetModel, reason, description });
    showToast('Report submitted. Thank you.');
    return res;
  },
};

// ─── SOCKET.IO CLIENT ─────────────────────────────────────────────────────────
let socket = null;

const initSocket = () => {
  const token = localStorage.getItem('accessToken');
  if (!token || socket?.connected) return;

  // Load socket.io client dynamically
  if (typeof io === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.6.2/socket.io.min.js';
    script.onload = () => connectSocket(token);
    document.head.appendChild(script);
  } else {
    connectSocket(token);
  }
};

const connectSocket = (token) => {
  socket = io('https://connectpro-social-media-platform.onrender.com', {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => console.log('🔌 Socket connected'));
  socket.on('disconnect', () => console.log('🔌 Socket disconnected'));

  socket.on('notification:new', (notification) => {
    handleNewNotification(notification);
  });

  socket.on('message:new', (message) => {
    handleNewMessage(message);
  });

  socket.on('typing:start', ({ username, conversationId }) => {
    showTypingIndicator(username, conversationId);
  });

  socket.on('typing:stop', ({ conversationId }) => {
    hideTypingIndicator(conversationId);
  });

  socket.on('user:online', ({ userId }) => {
    updateOnlineStatus(userId, true);
  });

  socket.on('user:offline', ({ userId, lastSeen }) => {
    updateOnlineStatus(userId, false, lastSeen);
  });
};

// ─── SOCKET EVENT HANDLERS ────────────────────────────────────────────────────
const handleNewNotification = (notification) => {
  // Update notification badge
  const badge = document.querySelector('.notification-badge');
  if (badge) {
    const current = parseInt(badge.textContent) || 0;
    badge.textContent = current + 1;
    badge.style.display = 'block';
  }

  // Show toast for important notifications
  const messages = {
    like: `${notification.sender?.name} liked your post`,
    comment: `${notification.sender?.name} commented on your post`,
    follow: `${notification.sender?.name} started following you`,
    mention: `${notification.sender?.name} mentioned you`,
    message: `New message from ${notification.sender?.name}`,
  };

  if (messages[notification.type]) {
    showToast(messages[notification.type], 'success');
  }

  // Dispatch event for UI to listen
  document.dispatchEvent(new CustomEvent('notification:new', { detail: notification }));
};

const handleNewMessage = (message) => {
  document.dispatchEvent(new CustomEvent('message:new', { detail: message }));
};

const showTypingIndicator = (username, conversationId) => {
  document.dispatchEvent(new CustomEvent('typing:start', { detail: { username, conversationId } }));
};

const hideTypingIndicator = (conversationId) => {
  document.dispatchEvent(new CustomEvent('typing:stop', { detail: { conversationId } }));
};

const updateOnlineStatus = (userId, isOnline, lastSeen = null) => {
  document.dispatchEvent(new CustomEvent('user:status', { detail: { userId, isOnline, lastSeen } }));
};

// ─── SOCKET HELPERS ───────────────────────────────────────────────────────────
const joinConversation = (conversationId) => {
  socket?.emit('conversation:join', conversationId);
};

const leaveConversation = (conversationId) => {
  socket?.emit('conversation:leave', conversationId);
};

let typingTimeout = null;
const emitTyping = (conversationId) => {
  socket?.emit('typing:start', { conversationId });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket?.emit('typing:stop', { conversationId }), 2000);
};


// ─── SHARED HELPERS ───────────────────────────────────────────────────────────
const formatTimeAgo = (dateStr) => {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
};

const escapeHtml = (str = '') => {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

// ─── EXPORTS (for use in other scripts) ──────────────────────────────────────
window.ConnectPro = {
  Auth, Users, Posts, Feed, Follows, Notifications, Messages, Search, Settings, Reports,
  socket, initSocket, joinConversation, leaveConversation, emitTyping,
  showToast, getStoredUser, formatTimeAgo,
};

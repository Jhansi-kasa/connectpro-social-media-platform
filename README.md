# ConnectPro — Full-Stack Social Media Platform

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB + Mongoose
- **Auth:** JWT (access + refresh tokens), bcrypt
- **Real-time:** Socket.io
- **Media:** Cloudinary
- **Email:** Nodemailer
- **Security:** Helmet, rate limiting, mongo-sanitize, XSS-clean, HPP

---

## Project Structure

```
connectpro/
├── server.js                  # Entry point
├── config/
│   ├── db.js                  # MongoDB connection
│   └── cloudinary.js          # Cloudinary + multer setup
├── controllers/
│   ├── authController.js      # Register, login, password flows
│   ├── userController.js      # Profile, avatar, block, delete
│   ├── postController.js      # CRUD, like, save, repost, pin
│   ├── commentController.js   # Comments + nested replies
│   ├── followController.js    # Follow/unfollow, requests
│   ├── notificationController.js
│   ├── messageController.js   # Conversations + messages
│   ├── feedController.js      # Home, explore, trending
│   ├── searchController.js    # Full-text + hashtag search
│   ├── settingsController.js  # Privacy, theme, notifications
│   └── adminController.js     # Dashboard, ban, reports
├── models/
│   ├── User.js                # Full user schema with settings
│   ├── Post.js                # Posts with media, hashtags
│   ├── Comment.js             # Nested comments
│   └── index.js               # Like, Follow, Notification, Conversation, Message, Report, SavedPost
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── posts.js
│   ├── comments.js
│   ├── follows.js
│   ├── notifications.js
│   ├── conversations.js       # + messages
│   ├── messages.js
│   ├── feed.js
│   ├── search.js
│   ├── settings.js
│   └── admin.js
├── middleware/
│   ├── auth.js                # protect, optionalAuth, authorize
│   ├── error.js               # Global error handler
│   └── validators.js          # express-validator chains
├── services/
│   └── notificationService.js # createNotification helper
├── sockets/
│   └── index.js               # Socket.io — typing, read receipts, online status
├── utils/
│   ├── jwt.js                 # Token generation + cookie setter
│   ├── email.js               # Nodemailer + templates
│   ├── helpers.js             # AppError, catchAsync, pagination
│   └── logger.js              # Winston logger
├── public/
│   ├── api-client.js          # Frontend JS — connects existing HTML to API
│   └── uploads/               # Local fallback (use Cloudinary in prod)
├── logs/
├── .env.example
├── .gitignore
└── package.json
```

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in MONGO_URI, JWT secrets, Cloudinary keys, email credentials
```

### 3. Run
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

---

## Frontend Integration

Add to your `home.html` `<head>`, **before** `script.js`:
```html
<script src="http://localhost:5000/api-client.js"></script>
<!-- or serve the file locally -->
<script src="api-client.js"></script>
```

The `api-client.js` automatically:
- Wires the login form to `POST /api/auth/login`
- Loads the real home feed from `GET /api/feed/home`
- Handles like/save toggle buttons
- Loads real conversations and messages
- Loads real notifications with accept/decline for follow requests
- Connects Socket.io for real-time messages, typing indicators, and live notifications
- Wires settings (dark mode, logout, delete account, change password)
- Wires the search bar

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register |
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| POST | /api/auth/refresh-token | Refresh JWT |
| GET | /api/auth/me | Get current user |
| GET | /api/auth/verify-email/:token | Verify email |
| POST | /api/auth/resend-verification | Resend email |
| POST | /api/auth/forgot-password | Send reset link |
| PUT | /api/auth/reset-password/:token | Reset password |
| PUT | /api/auth/change-password | Change password |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users/:username | Get profile |
| GET | /api/users/:username/posts | User's posts |
| PUT | /api/users/me/profile | Update profile |
| PUT | /api/users/me/avatar | Upload avatar |
| PUT | /api/users/me/cover | Upload cover photo |
| GET | /api/users/me/saved | Saved posts |
| GET | /api/users/suggestions | Suggested users |
| POST | /api/users/:userId/block | Block user |
| DELETE | /api/users/:userId/block | Unblock |
| PUT | /api/users/me/deactivate | Deactivate account |
| DELETE | /api/users/me/delete | Delete account |

### Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/posts | Create post (multipart) |
| GET | /api/posts/:id | Get post |
| PUT | /api/posts/:id | Update post |
| DELETE | /api/posts/:id | Delete post |
| POST | /api/posts/:id/like | Toggle like |
| POST | /api/posts/:id/save | Toggle save |
| POST | /api/posts/:id/repost | Repost / quote |
| PUT | /api/posts/:id/pin | Toggle pin |
| GET | /api/posts/:postId/comments | Get comments |
| POST | /api/posts/:postId/comments | Create comment |

### Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/comments/:commentId/replies | Get replies |
| PUT | /api/comments/:commentId | Edit comment |
| DELETE | /api/comments/:commentId | Delete comment |
| POST | /api/comments/:commentId/like | Toggle comment like |

### Feed
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/feed/home | Home feed (following) |
| GET | /api/feed/explore | Trending explore |
| GET | /api/feed/trending | Trending hashtags |

### Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/search?q=...&type=all|users|posts | Search |
| GET | /api/search/hashtag/:tag | Posts by hashtag |

### Follows
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/follows/:userId/toggle | Follow / unfollow |
| GET | /api/follows/:username/followers | Followers list |
| GET | /api/follows/:username/following | Following list |
| GET | /api/follows/me/requests | Pending requests |
| POST | /api/follows/requests/:followerId/accept | Accept request |
| DELETE | /api/follows/requests/:followerId/decline | Decline request |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notifications | All notifications |
| GET | /api/notifications/unread-count | Unread count |
| PUT | /api/notifications/read-all | Mark all read |
| PUT | /api/notifications/:id/read | Mark one read |
| DELETE | /api/notifications/:id | Delete notification |

### Conversations & Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/conversations | All conversations |
| GET | /api/conversations/with/:userId | Get or create DM |
| POST | /api/conversations/group | Create group chat |
| GET | /api/conversations/:id/messages | Get messages |
| POST | /api/conversations/:id/messages | Send message |
| DELETE | /api/conversations/:id | Delete conversation |
| DELETE | /api/messages/:messageId | Delete message |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/settings | Get settings |
| PUT | /api/settings/privacy | Update privacy |
| PUT | /api/settings/notifications | Update notification prefs |
| PUT | /api/settings/theme | Set theme (light/dark/system) |
| PUT | /api/settings/language | Set language |
| PUT | /api/settings/email | Change email |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/dashboard | Analytics |
| GET | /api/admin/users | User list |
| PUT | /api/admin/users/:id/ban | Ban user |
| PUT | /api/admin/users/:id/unban | Unban user |
| GET | /api/admin/reports | Content reports |
| PUT | /api/admin/reports/:id/resolve | Resolve report |
| POST | /api/admin/report | Submit a report |

---

## Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `conversation:join` | conversationId | Join a chat room |
| `conversation:leave` | conversationId | Leave a chat room |
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |
| `message:read` | `{ conversationId, messageId }` | Mark message read |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `notification:new` | Notification object | New notification |
| `message:new` | Message object | New chat message |
| `message:deleted` | `{ messageId }` | Message deleted |
| `typing:start` | `{ userId, username, conversationId }` | Someone typing |
| `typing:stop` | `{ userId, conversationId }` | Stopped typing |
| `user:online` | `{ userId }` | User came online |
| `user:offline` | `{ userId, lastSeen }` | User went offline |

---

## Security Features
- JWT access tokens (7d) + refresh tokens (30d) in httpOnly cookies
- Password hashing with bcrypt (12 rounds)
- Rate limiting (100 req/15min general, 10/15min on auth)
- MongoDB injection protection (mongo-sanitize)
- XSS protection (xss-clean)
- HTTP param pollution protection (hpp)
- Secure HTTP headers (helmet)
- Input validation (express-validator)
- Password change invalidates all sessions
- Email verification required for sensitive operations

## Database Indexes
All models have compound indexes for common query patterns:
- Posts: `{ author, createdAt }`, `{ visibility, createdAt }`, `{ hashtags }`, full-text
- Users: `{ username }`, `{ email }`, full-text on name/username/bio
- Follows: `{ follower, following }` unique
- Likes: `{ user, target, targetModel }` unique
- Notifications: `{ recipient, isRead, createdAt }`
- Messages: `{ conversation, createdAt }`

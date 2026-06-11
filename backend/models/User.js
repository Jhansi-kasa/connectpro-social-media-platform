const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-z0-9._]+$/, 'Username can only contain letters, numbers, dots and underscores'],
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    avatar: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    coverPhoto: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    bio: { type: String, maxlength: [160, 'Bio cannot exceed 160 characters'], default: '' },
    website: { type: String, default: '' },
    location: { type: String, default: '' },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },

    // Social graph
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    followersCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    postsCount: { type: Number, default: 0 },

    // Auth
    role: { type: String, enum: ['user', 'admin', 'moderator'], default: 'user' },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    refreshToken: String,
    passwordChangedAt: Date,
    lastLogin: { type: Date, default: Date.now },

    // Status
    isActive: { type: Boolean, default: true },
    isDeactivated: { type: Boolean, default: false },
    deactivatedAt: Date,
    isBanned: { type: Boolean, default: false },
    bannedAt: Date,
    bannedReason: String,
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },

    // Settings
    settings: {
      privacy: {
        profileVisibility: { type: String, enum: ['public', 'private', 'followers'], default: 'public' },
        showFollowers: { type: Boolean, default: true },
        showFollowing: { type: Boolean, default: true },
        allowMessagesFrom: { type: String, enum: ['everyone', 'followers', 'none'], default: 'everyone' },
        allowTagging: { type: Boolean, default: true },
        showLocation: { type: Boolean, default: true },
      },
      notifications: {
        likes: { type: Boolean, default: true },
        comments: { type: Boolean, default: true },
        follows: { type: Boolean, default: true },
        messages: { type: Boolean, default: true },
        mentions: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
      },
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      language: { type: String, default: 'en' },
      twoFactorEnabled: { type: Boolean, default: false },
      twoFactorSecret: { type: String, select: false },
    },

    // Blocked users
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Saved posts
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],

    // Pinned post
    pinnedPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Indexes (username and email are indexed via unique:true in field definition)
UserSchema.index({ name: 'text', username: 'text', bio: 'text' });
UserSchema.index({ isActive: 1, isBanned: 1 });
UserSchema.index({ createdAt: -1 });

// Virtual: full avatar URL fallback
UserSchema.virtual('avatarUrl').get(function () {
  return this.avatar?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(this.name)}&background=random`;
});

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = Date.now() - 1000;
  next();
});

// Methods
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

UserSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
  return token;
};

UserSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

UserSchema.methods.isBlocking = function (userId) {
  return (this.blockedUsers || []).some((id) => id.toString() === userId.toString());
};

module.exports = mongoose.model('User', UserSchema);

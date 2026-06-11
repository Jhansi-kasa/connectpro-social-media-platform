const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  type: { type: String, enum: ['image', 'video', 'gif'], default: 'image' },
  width: Number,
  height: Number,
  duration: Number, // for videos, in seconds
});

const PostSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      maxlength: [2200, 'Post content cannot exceed 2200 characters'],
      default: '',
    },
    media: [MediaSchema],

    // Privacy
    visibility: {
      type: String,
      enum: ['public', 'followers', 'private'],
      default: 'public',
    },

    // Post type
    type: {
      type: String,
      enum: ['post', 'repost', 'quote'],
      default: 'post',
    },

    // Original post (for reposts/quotes)
    originalPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    quoteContent: { type: String, maxlength: 500 },

    // Engagement counts (denormalized for performance)
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    sharesCount: { type: Number, default: 0 },
    savesCount: { type: Number, default: 0 },
    viewsCount: { type: Number, default: 0 },

    // Hashtags & mentions
    hashtags: [{ type: String, lowercase: true }],
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Status
    isDraft: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },
    editedAt: Date,

    // Location
    location: {
      name: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },

    // Moderation
    isReported: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    hiddenReason: String,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Indexes
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ visibility: 1, createdAt: -1 });
PostSchema.index({ hashtags: 1 });
PostSchema.index({ content: 'text' });
PostSchema.index({ isDraft: 1, author: 1 });
PostSchema.index({ createdAt: -1 });

// Extract hashtags from content before save
PostSchema.pre('save', function (next) {
  if (this.isModified('content') && this.content) {
    const tags = this.content.match(/#[a-zA-Z0-9_]+/g);
    this.hashtags = tags ? tags.map((t) => t.slice(1).toLowerCase()) : [];
    const mentions = this.content.match(/@[a-zA-Z0-9._]+/g);
    if (mentions) {
      // Note: actual mention resolution happens in the controller
      this._mentionUsernames = mentions.map((m) => m.slice(1).toLowerCase());
    }
  }
  next();
});

module.exports = mongoose.model('Post', PostSchema);

// models/User.js
const mongoose = require('mongoose');

// Nested schema for user stats
const ProfileStatsSchema = new mongoose.Schema({
  titlesCount: { type: Number, default: 0 },    // number of books/animes tracked on site
  pagesRead: { type: Number, default: 0 },      // pages read (if you track this)
  lendingCount: { type: Number, default: 0 }    // how many lendings user has done
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // optional human-readable name (kept from your version for compatibility)
  name: {
    type: String,
    default: ""
  },
  // optional email for notifications/contact
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ""
  },
  // stores hashed password
  password: {
    type: String,
    required: true
  },

  // ---------- New profile fields ----------
  bio: { type: String, default: "" },
  location: { type: String, default: "" },
  avatarUrl: { type: String, default: "" },

  // small nested stats object for dashboard/profile
  stats: { type: ProfileStatsSchema, default: () => ({}) }
}, {
  timestamps: true // adds createdAt and updatedAt automatically
});

// Helpful index to speed lookups by username or email
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);

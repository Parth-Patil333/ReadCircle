// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // optional human-readable name (keeps backward-compatibility)
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
  password: {
    type: String,
    required: true
  }
}, {
  timestamps: true // adds createdAt and updatedAt
});

// Helpful index to speed lookups by username or email
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);

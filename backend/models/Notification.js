// models/Notification.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Notification
 * - user: recipient reference
 * - type: string (info, warning, lending, listing_reserved, etc.)
 * - message: short human-readable message
 * - data: arbitrary metadata object (listingId, lendingId, url, etc.)
 * - read: boolean
 * - createdAt: timestamp
 */

const NotificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, trim: true, default: 'info', index: true },
  message: { type: String, trim: true, required: true },
  data: { type: Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to query recent unread notifications quickly
NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);

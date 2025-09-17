// models/Notification.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const NotificationSchema = new Schema({
  // keep the existing field name 'user' to remain backward-compatible
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },

  // simple type so you can filter by 'reminder', 'overdue', 'info', etc.
  type: { type: String, default: "info" },

  // message shown in UI
  message: { type: String, required: true },

  // optional structured payload (e.g., { lendingId, url, meta })
  data: { type: Schema.Types.Mixed, default: {} },

  // whether the user has read the notification
  read: { type: Boolean, default: false },

  // when notification was created
  createdAt: { type: Date, default: Date.now }
});

// Useful indexes:
// - fast lookup for a user's notifications in descending time
// - fast count of unread notifications
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, read: 1 });

module.exports = mongoose.model("Notification", NotificationSchema);

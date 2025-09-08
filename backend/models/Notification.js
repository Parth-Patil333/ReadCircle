const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // who receives the notification
  type: { type: String, required: true }, // e.g., "lending_assigned", "due_soon", "overdue"
  data: { type: Object, default: {} },   // arbitrary payload (e.g., { lendingId, message })
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Notification", notificationSchema);

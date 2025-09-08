// models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // who receives it
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // sender (lender usually)
  type: { type: String, required: true }, // e.g., "lending_request", "lending_returned"
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }, // can store { lendingId, extra }
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Notification", notificationSchema);

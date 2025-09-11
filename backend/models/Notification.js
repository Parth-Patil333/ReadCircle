// models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // recipient
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who triggered it (lender/other)
  type: { type: String, enum: ['lending_request','lending_created','lending_returned','reminder','custom'], default: 'custom' },
  message: { type: String, required: true },
  link: { type: String }, // optional link to lending page or lending id
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);

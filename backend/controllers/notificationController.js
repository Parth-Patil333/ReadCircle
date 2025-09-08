// controllers/notificationController.js
const Notification = require("../models/Notification");

// Get notifications for logged-in user (most recent first)
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifs = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(100);
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark a single notification as read
const markRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const notif = await Notification.findOneAndUpdate({ _id: id, userId }, { read: true }, { new: true });
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Marked read", notif });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark all as read
const markAllRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
    res.json({ message: "All notifications marked read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a notification
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const deleted = await Notification.findOneAndDelete({ _id: id, userId });
    if (!deleted) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getNotifications, markRead, markAllRead, deleteNotification };

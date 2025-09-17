// controllers/notificationController.js
const Notification = require("../models/Notification");

/**
 * GET /api/notifications
 * Query params:
 *  - page (default 1)
 *  - limit (default 50, max 200)
 *  - unreadOnly (boolean "true" to filter unread)
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
    const skip = (page - 1) * limit;

    const filter = { user: userId }; // NOTE: model uses `user` field (not `userId`)
    if (req.query.unreadOnly === "true") filter.read = false;

    const [items, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter)
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    console.error("getNotifications error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/notifications/unread-count
 * Returns { unread: number }
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await Notification.countDocuments({ user: userId, read: false });
    res.json({ unread: count });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
const markRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const notif = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { $set: { read: true } },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Marked read", notif });
  } catch (err) {
    console.error("markRead error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all unread notifications for the user as read
 */
const markAllRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });
    res.json({ message: "All notifications marked read" });
  } catch (err) {
    console.error("markAllRead error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * DELETE /api/notifications/:id
 * Delete a notification (user can only delete their own)
 */
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const deleted = await Notification.findOneAndDelete({ _id: id, user: userId });
    if (!deleted) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    console.error("deleteNotification error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { getNotifications, getUnreadCount, markRead, markAllRead, deleteNotification };

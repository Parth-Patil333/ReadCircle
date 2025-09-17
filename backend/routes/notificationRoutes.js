// routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth"); // adjust path if your auth middleware lives elsewhere

const {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification
} = require("../controllers/notificationController");

// Get list of notifications (paginated)
// GET /api/notifications?page=1&limit=50&unreadOnly=true
router.get("/", auth, getNotifications);

// Get unread count
// GET /api/notifications/unread-count
router.get("/unread-count", auth, getUnreadCount);

// Mark a single notification as read
// PATCH /api/notifications/:id/read
router.patch("/:id/read", auth, markRead);

// Mark all notifications as read
// PATCH /api/notifications/read-all
router.patch("/read-all", auth, markAllRead);

// Delete a notification
// DELETE /api/notifications/:id
router.delete("/:id", auth, deleteNotification);

module.exports = router;

// routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification
} = require("../controllers/notificationController");

router.get("/", auth, getNotifications);
router.post("/read/:id", auth, markRead);
router.post("/read-all", auth, markAllRead);
router.delete("/:id", auth, deleteNotification);

module.exports = router;

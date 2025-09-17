// services/notificationService.js
// Centralized notification helper with optional de-duplication and socket emit support.
// Works with models/Notification.js that uses `user` as the recipient field.

const Notification = require("../models/Notification");

/**
 * createNotification - create a notification unconditionally
 * @param {Object} opts
 *  - userId: ObjectId or string (required)
 *  - type: string (default 'info')
 *  - message: string (required)
 *  - data: object (optional)
 *  - read: boolean (default false)
 */
async function createNotification({ userId, type = "info", message, data = {}, read = false }) {
  if (!userId) throw new Error("createNotification: userId is required");
  const notif = new Notification({
    user: userId,
    type,
    message,
    data,
    read,
    createdAt: new Date()
  });
  await notif.save();

  // If you use socket.io and expose a global emitter, try to emit realtime update.
  // (Set global.__io in server.js: global.__io = io;)
  try {
    if (global && global.__io && typeof global.__io.to === "function") {
      global.__io.to(String(userId)).emit("notification", {
        id: notif._id,
        type: notif.type,
        message: notif.message,
        data: notif.data,
        read: notif.read,
        createdAt: notif.createdAt
      });
    }
  } catch (e) {
    // non-fatal; logging only
    console.warn("notificationService: socket emit failed:", e.message);
  }

  return notif;
}

/**
 * createNotificationIfNotExists - create a notification but avoid duplicates within a window
 * @param {Object} opts
 *  - userId, type, message, data, read
 *  - dedupeWindowHours: number (default 24) — do not create if same type + data.lendingId exists within window
 */
async function createNotificationIfNotExists({ userId, type = "info", message, data = {}, read = false, dedupeWindowHours = 24 }) {
  if (!userId) throw new Error("createNotificationIfNotExists: userId is required");

  // Basic dedupe heuristic: same user + same type + same lendingId in data
  const since = new Date(Date.now() - Math.max(0, dedupeWindowHours) * 3600 * 1000);

  const query = { user: userId, type, createdAt: { $gte: since } };

  if (data && data.lendingId) {
    query["data.lendingId"] = data.lendingId;
  } else if (data && data.listingId) {
    // also support listingId for buy/sell features
    query["data.listingId"] = data.listingId;
  }

  const exists = await Notification.findOne(query).lean();
  if (exists) return exists;

  return createNotification({ userId, type, message, data, read });
}

/**
 * markAsRead - mark a single notification read for a user
 */
async function markAsRead({ userId, notificationId }) {
  if (!userId || !notificationId) throw new Error("markAsRead: userId and notificationId are required");
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { read: true } },
    { new: true }
  );
  return updated;
}

/**
 * markAllRead - mark all unread notifications as read for a user
 */
async function markAllRead({ userId }) {
  if (!userId) throw new Error("markAllRead: userId is required");
  const res = await Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });
  return res;
}

module.exports = {
  createNotification,
  createNotificationIfNotExists,
  markAsRead,
  markAllRead
};

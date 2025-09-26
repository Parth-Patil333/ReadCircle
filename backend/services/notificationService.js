// services/notificationService.js
// Centralized notification helper with socket emit support and defensive emits
// - Creates notifications in DB
// - Emits to both raw user room and prefixed user_<id> room for compatibility
// - Honors DEBUG_NOTIF env var for extra logs

const Notification = require("../models/Notification");

function debug(...args) {
  if (process.env.DEBUG_NOTIF === '1') {
    try { console.debug('[notificationService]', ...args); } catch (e) {}
  }
}

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

  // Emit realtime update to the user (both raw and prefixed rooms) if socket available
  try {
    const io = global && global.__io ? global.__io : null;
    if (io && typeof io.to === 'function') {
      const rawRoom = String(userId);
      const prefRoom = `user_${String(userId)}`;

      const payload = {
        id: notif._id,
        type: notif.type,
        message: notif.message,
        data: notif.data,
        read: notif.read,
        createdAt: notif.createdAt
      };

      try {
        io.to(rawRoom).emit('notification', payload);
      } catch (e) {
        console.warn('notificationService: emit to rawRoom failed', rawRoom, e && e.message ? e.message : e);
      }

      try {
        io.to(prefRoom).emit('notification', payload);
      } catch (e) {
        console.warn('notificationService: emit to prefRoom failed', prefRoom, e && e.message ? e.message : e);
      }

      debug('emitted notification to rooms', rawRoom, prefRoom, payload);
    } else {
      debug('no io available; skipping socket emit for notification', notif._id);
    }
  } catch (e) {
    console.warn('notificationService: socket emit failed', e && e.message ? e.message : e);
  }

  return notif;
}

async function createNotificationIfNotExists({ userId, type = "info", message, data = {}, read = false, dedupeWindowHours = 24 }) {
  if (!userId) throw new Error("createNotificationIfNotExists: userId is required");

  const since = new Date(Date.now() - Math.max(0, dedupeWindowHours) * 3600 * 1000);

  const query = { user: userId, type, createdAt: { $gte: since } };

  if (data && data.lendingId) {
    query["data.lendingId"] = data.lendingId;
  } else if (data && data.listingId) {
    query["data.listingId"] = data.listingId;
  }

  const exists = await Notification.findOne(query).lean();
  if (exists) {
    debug('createNotificationIfNotExists: found existing', exists._id);
    return exists;
  }

  return createNotification({ userId, type, message, data, read });
}

async function markAsRead({ userId, notificationId }) {
  if (!userId || !notificationId) throw new Error("markAsRead: userId and notificationId are required");
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { read: true } },
    { new: true }
  );
  // emit update to user's rooms
  try {
    const io = global && global.__io ? global.__io : null;
    if (io && typeof io.to === 'function') {
      const rawRoom = String(userId);
      const prefRoom = `user_${String(userId)}`;
      const payload = { id: notificationId, read: true };
      io.to(rawRoom).emit('notification:update', payload);
      io.to(prefRoom).emit('notification:update', payload);
    }
  } catch (e) {
    debug('markAsRead: emit failed', e && e.message ? e.message : e);
  }
  return updated;
}

async function markAllRead({ userId }) {
  if (!userId) throw new Error("markAllRead: userId is required");
  const res = await Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });

  try {
    const io = global && global.__io ? global.__io : null;
    if (io && typeof io.to === 'function') {
      const rawRoom = String(userId);
      const prefRoom = `user_${String(userId)}`;
      const payload = { markAllRead: true, timestamp: new Date() };
      io.to(rawRoom).emit('notification:markAllRead', payload);
      io.to(prefRoom).emit('notification:markAllRead', payload);
    }
  } catch (e) {
    debug('markAllRead: emit failed', e && e.message ? e.message : e);
  }

  return res;
}

module.exports = {
  createNotification,
  createNotificationIfNotExists,
  markAsRead,
  markAllRead
};

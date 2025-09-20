// utils/notify.js
/**
 * Notify a specific user via Socket.IO
 *
 * @param {String|ObjectId} userId - The user's ID (must match the room joined in server.js)
 * @param {Object} payload - The notification data (must be JSON-serializable)
 *   Example: { type: 'lending_request', message: '...', data: {...} }
 * @param {Object} [app] - Optional Express app instance (to get io if global.__io is not used)
 *
 * @returns {Boolean} true if emitted successfully, false otherwise
 */
module.exports = function notify(userId, payload, app) {
  try {
    if (!userId) {
      console.error("notify: userId required");
      return false;
    }

    const io = app && app.get ? app.get("io") : global.__io;
    if (!io) {
      console.error("notify: Socket.IO instance not found");
      return false;
    }

    io.to(String(userId)).emit("notification", payload);
    return true;
  } catch (e) {
    console.error("notify error:", e);
    return false;
  }
};

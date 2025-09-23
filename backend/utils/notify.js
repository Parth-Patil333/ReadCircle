// utils/notify.js
/**
 * Centralized notifier for ReadCircle (socket emits)
 *
 * Backwards-compatible:
 * - Emits to both raw userId rooms (e.g. "605...") and prefixed rooms ("user_605...")
 *   so older code which uses io.to(String(userId)) still works, while newer code
 *   can use notify.user(...) and rely on user_<id> convention.
 *
 * Usage:
 *   const notify = require('../utils/notify');
 *   notify.user(req, userId, 'listing_reserved', { listingId, ... });
 *   notify.broadcastListings(req, 'new-listing', listingObject);
 *
 * The functions accept an optional first argument that can be `req` (so controllers
 * can call notify.user(req, ...) and the helper will fetch io from req.app.get('io')).
 */

function _getIo(appOrReq) {
  // allow either passing req (with app.get) or null
  if (appOrReq && appOrReq.app && typeof appOrReq.app.get === 'function') {
    const io = appOrReq.app.get('io');
    if (io) return io;
  }
  // fallback to global
  if (global && global.__io) return global.__io;
  return null;
}

function rawRoom(userId) {
  if (!userId) return null;
  return String(userId);
}
function prefixedRoom(userId) {
  if (!userId) return null;
  return `user_${String(userId)}`;
}

module.exports = {
  /**
   * Send event to a single user.
   * Accepts either:
   *  - notify.user(req, userId, event, payload)
   *  - notify.user(userId, event, payload)
   *
   * It will attempt to emit to both rawRoom(userId) and prefixedRoom(userId).
   */
  user(appOrReq, userId, event, payload) {
    try {
      // Normalize arguments: support calling without req
      if (arguments.length === 3) {
        // notify.user(userId, event, payload) where payload is undefined
        payload = event;
        event = userId;
        userId = appOrReq;
        appOrReq = null;
      } else if (arguments.length === 4 && appOrReq && typeof appOrReq === 'string') {
        // notify.user(userId, event, payload)
        // already in that shape; shift variables accordingly
      }

      // if someone called notify.user(req, userId, event, payload) then appOrReq is req
      const io = _getIo(appOrReq);
      if (!io) {
        console.warn('notify.user: no io available — skipping emit', event, userId);
        return;
      }

      const uRaw = rawRoom(userId);
      const uPref = prefixedRoom(userId);

      // Emit to raw room for backward compatibility (many existing parts may join raw uid)
      if (uRaw) {
        try {
          io.to(uRaw).emit(event, payload);
        } catch (err) {
          console.warn('notify.user: emit to raw room failed', uRaw, err && err.message ? err.message : err);
        }
      }

      // Emit to prefixed room (newer convention)
      if (uPref) {
        try {
          io.to(uPref).emit(event, payload);
        } catch (err) {
          console.warn('notify.user: emit to prefixed room failed', uPref, err && err.message ? err.message : err);
        }
      }
    } catch (err) {
      console.error('notify.user error', err);
    }
  },

  /**
   * Broadcast to all listing watchers (joined to 'listings' room)
   * notify.broadcastListings(req, 'new-listing', payload)
   */
  broadcastListings(appOrReq, event, payload) {
    try {
      const io = _getIo(appOrReq);
      if (!io) {
        console.warn('notify.broadcastListings: no io — skipping');
        return;
      }
      io.to('listings').emit(event, payload);
    } catch (err) {
      console.error('notify.broadcastListings error', err);
    }
  },

  /**
   * Broadcast to a raw room name (advanced)
   * notify.room(req, 'admin_room', 'some_event', payload)
   */
  room(appOrReq, roomName, event, payload) {
    try {
      const io = _getIo(appOrReq);
      if (!io) {
        console.warn('notify.room: no io — skipping');
        return;
      }
      io.to(roomName).emit(event, payload);
    } catch (err) {
      console.error('notify.room error', err);
    }
  }
};

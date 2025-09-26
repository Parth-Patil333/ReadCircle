// utils/notify.js
// Centralized notifier for ReadCircle (socket emits)
// - Emits to both raw userId rooms (e.g. "605...") and prefixed rooms ("user_605...")
// - Accepts either (req, userId, event, payload) or (userId, event, payload)
// - Provides DEBUG_NOTIFY=1 env flag for verbose logs
// - Defensive: validates inputs and fails gracefully

function _getIo(appOrReq) {
  try {
    // If req with app.get('io') provided
    if (appOrReq && appOrReq.app && typeof appOrReq.app.get === 'function') {
      const io = appOrReq.app.get('io');
      if (io) return io;
    }
  } catch (e) {
    // ignore
  }
  // fallback to global
  if (global && global.__io) return global.__io;
  return null;
}

function rawRoom(userId) {
  if (!userId && userId !== 0) return null;
  return String(userId);
}
function prefixedRoom(userId) {
  if (!userId && userId !== 0) return null;
  return `user_${String(userId)}`;
}

function debug(...args) {
  if (process.env.DEBUG_NOTIFY === '1') {
    try { console.debug('[notify]', ...args); } catch (e) {}
  }
}

module.exports = {
  /**
   * notify.user(reqOrUserId, userIdOrEvent, eventOrPayload, maybePayload)
   *
   * Support argument shapes:
   *  - notify.user(req, userId, event, payload)
   *  - notify.user(userId, event, payload)
   *  - notify.user(userId, event) // payload optional
   */
  user(appOrReq, userId, event, payload) {
    try {
      // Normalize arguments
      if (arguments.length === 3) {
        // notify.user(userId, event, payload) where payload missing => third arg is payload optional
        payload = event;
        event = userId;
        userId = appOrReq;
        appOrReq = null;
      } else if (arguments.length === 2) {
        // notify.user(userId, event) -> payload undefined
        event = userId;
        userId = appOrReq;
        appOrReq = null;
        payload = undefined;
      } else if (arguments.length === 4 && typeof appOrReq === 'string') {
        // shape: userId, event, payload passed as first arg incorrectly; adjust not required
      }

      if (!userId) {
        debug('user: missing userId, skipping emit', event);
        return;
      }
      if (!event) {
        debug('user: missing event name for user', userId);
        return;
      }

      const io = _getIo(appOrReq);
      if (!io) {
        debug('user: no io available — skipping emit', event, userId);
        return;
      }

      const uRaw = rawRoom(userId);
      const uPref = prefixedRoom(userId);

      // Emit to raw room (backwards compatibility)
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

      debug('user: emitted', event, { userId, payload });
    } catch (err) {
      console.error('notify.user error', err && err.message ? err.message : err);
    }
  },

  /**
   * Broadcast to listing watchers (joined to 'listings' room)
   * notify.broadcastListings(reqOrNull, event, payload)
   */
  broadcastListings(appOrReq, event, payload) {
    try {
      if (!event) {
        debug('broadcastListings: missing event');
        return;
      }
      const io = _getIo(appOrReq);
      if (!io) {
        debug('broadcastListings: no io — skipping', event);
        return;
      }
      io.to('listings').emit(event, payload);
      debug('broadcastListings: emitted', event, payload && (payload.id || payload._id));
    } catch (err) {
      console.error('notify.broadcastListings error', err && err.message ? err.message : err);
    }
  },

  /**
   * Generic room emitter
   * notify.room(reqOrNull, roomName, event, payload)
   */
  room(appOrReq, roomName, event, payload) {
    try {
      if (!roomName || !event) {
        debug('room: missing roomName or event', roomName, event);
        return;
      }
      const io = _getIo(appOrReq);
      if (!io) {
        debug('room: no io — skipping', roomName, event);
        return;
      }
      io.to(roomName).emit(event, payload);
      debug('room: emitted', roomName, event);
    } catch (err) {
      console.error('notify.room error', err && err.message ? err.message : err);
    }
  }
};

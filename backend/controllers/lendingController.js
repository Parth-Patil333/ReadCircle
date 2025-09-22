// controllers/lendingController.js
const Lending = require('../models/Lending');
const Notification = require('../models/Notification');
const User = require('../models/User'); // if needed
const mongoose = require('mongoose');

/**
 * Utility: resolve user id from req.user in a robust way
 */
function resolveUserId(user) {
  if (!user) return null;
  return user.id || user._id || user.userId || user._id?.toString?.() || user.toString?.();
}

/**
 * Utility: returns plain JS object from mongoose doc or input (safe for socket emit)
 */
function toPlain(obj) {
  if (!obj) return obj;
  if (typeof obj.toObject === 'function') return obj.toObject();
  return obj;
}

/**
 * Small helper to emit safely
 */
function emitSafe(io, room, eventName, payload) {
  try {
    if (!io || !room) return;
    io.to(String(room)).emit(eventName, payload);
  } catch (e) {
    console.warn('emitSafe error', e && e.stack ? e.stack : e);
  }
}

// -------------------- CREATE LENDING --------------------
const createLending = async (req, res) => {
  try {
    const io = req.app ? req.app.get('io') : null;
    const lenderId = resolveUserId(req.user);

    // Basic auth guard
    if (!lenderId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const { bookId, borrowerId, dueDate, notes } = req.body || {};

    // Validation: require bookId and borrowerId (route validator also checks, but double-check)
    if (!bookId || !borrowerId) {
      return res.status(400).json({ success: false, message: 'bookId and borrowerId required', code: 'VALIDATION_ERROR' });
    }

    // Validate ObjectId formats (defensive)
    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ success: false, message: 'Invalid bookId', code: 'VALIDATION_ERROR' });
    }
    if (!mongoose.Types.ObjectId.isValid(borrowerId)) {
      return res.status(400).json({ success: false, message: 'Invalid borrowerId', code: 'VALIDATION_ERROR' });
    }

    if (String(borrowerId) === String(lenderId)) {
      return res.status(400).json({ success: false, message: "You can't lend to yourself", code: 'INVALID_REQUEST' });
    }

    // Look up book by id first, then confirm ownership in a flexible way
    const Book = require('../models/Book');
    const book = await Book.findById(bookId).lean();
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found', code: 'NOT_FOUND' });
    }

    const ownerCandidate = book.userId || book.user || book.owner || book.ownerId || book.createdBy;
    // compare as strings
    if (!ownerCandidate || String(ownerCandidate) !== String(lenderId)) {
      return res.status(403).json({ success: false, message: "You don't own this book", code: 'FORBIDDEN' });
    }

    // Optional: ensure borrower exists (better UX than letting DB foreign refs fail)
    const borrowerDoc = await User.findById(borrowerId).lean();
    if (!borrowerDoc) {
      return res.status(404).json({ success: false, message: 'Borrower not found', code: 'NOT_FOUND' });
    }

    // create lending record
    const newLending = new Lending({
      book: book._id,
      bookTitle: book.title || undefined,
      bookAuthor: book.author || undefined,
      lender: lenderId,
      borrower: borrowerId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      status: 'lent'
    });

    await newLending.save();

    // populate required fields for response and emits
    await newLending.populate([
      { path: 'book', select: 'title author' },
      { path: 'lender', select: 'username name email' },
      { path: 'borrower', select: 'username name email' }
    ]);

    // create a Notification doc for the borrower
    const notif = new Notification({
      user: borrowerId,
      actor: lenderId,
      type: 'lending_created',
      message: `${(newLending.lender && newLending.lender.username) || 'Someone'} lent you "${book.title || newLending.bookTitle}".`,
      link: `/lending/${newLending._id}`
    });
    const savedNotif = await notif.save();

    // realtime: emit plain objects (no Mongoose document)
    const lendingPlain = toPlain(newLending);
    const notifPlain = toPlain(savedNotif);

    if (io) {
      // send notification object to borrower room
      emitSafe(io, borrowerId, 'notification', {
        _id: notifPlain._id,
        message: notifPlain.message,
        type: notifPlain.type,
        link: notifPlain.link,
        createdAt: notifPlain.createdAt,
        read: notifPlain.read,
        actor: { _id: lendingPlain.lender?._id || lendingPlain.lender, username: lendingPlain.lender?.username }
      });

      // inform lender and others about lending created with a plain payload
      emitSafe(io, lenderId, 'lending:created', { lending: lendingPlain });
    }

    return res.status(201).json({ success: true, data: lendingPlain });
  } catch (err) {
    // log full error for diagnosis
    console.error('createLending error:', err && err.stack ? err.stack : err);
    const payload = { success: false, message: 'Server error', code: 'SERVER_ERROR' };
    if (process.env.NODE_ENV !== 'production') payload.stack = err.stack;
    return res.status(500).json(payload);
  }
};

// -------------------- GET USER LENDINGS --------------------
const getUserLendings = async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const lendings = await Lending.find({
      $or: [{ lender: userId }, { borrower: userId }]
    })
      .populate('book', 'title author')
      .populate('lender', 'username name email')
      .populate('borrower', 'username name email')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: lendings });
  } catch (err) {
    console.error('getUserLendings error:', err && err.stack ? err.stack : err);
    const payload = { success: false, message: 'Server error', code: 'SERVER_ERROR' };
    if (process.env.NODE_ENV !== 'production') payload.stack = err.stack;
    return res.status(500).json(payload);
  }
};

// -------------------- MARK RETURNED --------------------
const markReturned = async (req, res) => {
  try {
    const io = req.app ? req.app.get('io') : null;
    const userId = resolveUserId(req.user);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid lending id', code: 'VALIDATION_ERROR' });
    }

    const lending = await Lending.findById(id)
      .populate('book', 'title author')
      .populate('lender', 'username name email')
      .populate('borrower', 'username name email');

    if (!lending) {
      return res.status(404).json({ success: false, message: 'Lending not found', code: 'NOT_FOUND' });
    }

    if (String(lending.lender._id) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Only lender can mark returned', code: 'FORBIDDEN' });
    }
    if (lending.status === 'returned') {
      return res.status(400).json({ success: false, message: 'Already marked returned', code: 'ALREADY_RETURNED' });
    }

    lending.status = 'returned';
    lending.returnedOn = new Date();
    await lending.save();

    const notif = new Notification({
      user: lending.borrower._id,
      actor: userId,
      type: 'lending_returned',
      message: `${lending.lender.username || 'Lender'} marked "${lending.book.title}" as returned.`,
      link: `/lending/${lending._id}`
    });
    const savedNotif = await notif.save();

    const lendingPlain = toPlain(lending);
    const notifPlain = toPlain(savedNotif);

    if (io) {
      emitSafe(io, lending.borrower._id, 'notification', {
        _id: notifPlain._id,
        message: notifPlain.message,
        type: notifPlain.type,
        link: notifPlain.link,
        createdAt: notifPlain.createdAt,
        read: notifPlain.read,
        actor: { _id: userId, username: lending.lender.username }
      });

      emitSafe(io, lending.lender._id, 'lending:updated', { lending: lendingPlain });
    }

    return res.json({ success: true, data: lendingPlain });
  } catch (err) {
    console.error('markReturned error:', err && err.stack ? err.stack : err);
    const payload = { success: false, message: 'Server error', code: 'SERVER_ERROR' };
    if (process.env.NODE_ENV !== 'production') payload.stack = err.stack;
    return res.status(500).json(payload);
  }
};

// -------------------- DELETE LENDING --------------------
const deleteLending = async (req, res) => {
  try {
    const io = req.app ? req.app.get('io') : null;
    const userId = resolveUserId(req.user);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid lending id', code: 'VALIDATION_ERROR' });
    }

    const lending = await Lending.findById(id)
      .populate('book', 'title author')
      .populate('lender', 'username name email')
      .populate('borrower', 'username name email');

    if (!lending) {
      return res.status(404).json({ success: false, message: 'Lending not found', code: 'NOT_FOUND' });
    }

    if (String(lending.lender._id) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Only lender can delete lending', code: 'FORBIDDEN' });
    }

    await Lending.deleteOne({ _id: id });

    const notif = new Notification({
      user: lending.borrower._id,
      actor: userId,
      type: 'lending_deleted',
      message: `${lending.lender.username || 'Lender'} removed the lending of "${(lending.book && lending.book.title) || lending.bookTitle}".`,
      link: null
    });
    const savedNotif = await notif.save();

    const notifPlain = toPlain(savedNotif);
    if (io) {
      emitSafe(io, lending.borrower._id, 'notification', {
        _id: notifPlain._id,
        message: notifPlain.message,
        type: notifPlain.type,
        link: notifPlain.link,
        createdAt: notifPlain.createdAt,
        read: notifPlain.read,
        actor: { _id: userId, username: lending.lender.username }
      });

      emitSafe(io, lending.lender._id, 'lending:deleted', { id });
      emitSafe(io, lending.borrower._id, 'lending:deleted', { id });
    }

    return res.json({ success: true, message: 'Lending deleted' });
  } catch (err) {
    console.error('deleteLending error:', err && err.stack ? err.stack : err);
    const payload = { success: false, message: 'Server error', code: 'SERVER_ERROR' };
    if (process.env.NODE_ENV !== 'production') payload.stack = err.stack;
    return res.status(500).json(payload);
  }
};

// -------------------- NOTIFICATIONS --------------------
const getNotifications = async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });

    const notifs = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ success: true, data: notifs });
  } catch (err) {
    console.error('getNotifications error:', err && err.stack ? err.stack : err);
    const payload = { success: false, message: 'Server error', code: 'SERVER_ERROR' };
    if (process.env.NODE_ENV !== 'production') payload.stack = err.stack;
    return res.status(500).json(payload);
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id', code: 'VALIDATION_ERROR' });
    }

    const notif = await Notification.findById(id);
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found', code: 'NOT_FOUND' });
    if (String(notif.user) !== String(userId)) return res.status(403).json({ success: false, message: 'Not allowed', code: 'FORBIDDEN' });

    notif.read = true;
    await notif.save();

    return res.json({ success: true, data: notif.toObject ? notif.toObject() : notif });
  } catch (err) {
    console.error('markNotificationRead error:', err && err.stack ? err.stack : err);
    const payload = { success: false, message: 'Server error', code: 'SERVER_ERROR' };
    if (process.env.NODE_ENV !== 'production') payload.stack = err.stack;
    return res.status(500).json(payload);
  }
};

module.exports = {
  createLending,
  getUserLendings,
  markReturned,
  deleteLending,
  getNotifications,
  markNotificationRead
};

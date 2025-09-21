// controllers/lendingController.js
const Lending = require('../models/Lending');
const Notification = require('../models/Notification');
const User = require('../models/User'); // if needed

// Create a lending: borrower receives notification
// PART 1: updated createLending
// PART A: createLending (replace existing)
const createLending = async (req, res) => {
  try {
    const io = req.app.get('io');
    const lenderId = req.user.id;
    const { bookId, borrowerId, dueDate, notes } = req.body;

    if (!bookId || !borrowerId) {
      return res.status(400).json({ success: false, message: 'bookId and borrowerId required', code: 'VALIDATION_ERROR' });
    }
    if (String(borrowerId) === String(lenderId)) {
      return res.status(400).json({ success: false, message: "You can't lend to yourself", code: 'INVALID_REQUEST' });
    }

    // verify book exists and belongs to lender
    const Book = require('../models/Book');
    const book = await Book.findOne({ _id: bookId, userId: lenderId });
    if (!book) {
      return res.status(403).json({ success: false, message: "You don't own this book", code: 'FORBIDDEN' });
    }

    // create lending record
    const lending = new Lending({
      book: book._id,
      bookTitle: book.title, // keep legacy for now
      lender: lenderId,
      borrower: borrowerId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      status: 'lent'
    });

    await lending.save();
    await lending.populate([
      { path: 'book', select: 'title author' },
      { path: 'lender', select: 'username name email' },
      { path: 'borrower', select: 'username name email' }
    ]);

    // notification for borrower
    const Notification = require('../models/Notification');
    const notif = new Notification({
      user: borrowerId,
      actor: lenderId,
      type: 'lending_created',
      message: `${lending.lender.username || 'Someone'} lent you "${book.title}".`,
      link: `/lending/${lending._id}`
    });
    const savedNotif = await notif.save();

    // realtime emit
    if (io) {
      io.to(String(borrowerId)).emit('notification', {
        _id: savedNotif._id,
        message: savedNotif.message,
        type: savedNotif.type,
        link: savedNotif.link,
        createdAt: savedNotif.createdAt,
        read: savedNotif.read,
        actor: { _id: lending.lender._id, username: lending.lender.username }
      });

      io.to(String(lenderId)).emit('lending:created', { lending });
    }

    return res.status(201).json({ success: true, data: lending });
  } catch (err) {
    console.error('createLending error:', err);
    return res.status(500).json({ success: false, message: 'Server error', code: 'SERVER_ERROR' });
  }
};

// add near top of file (after requires)
function emitToUser(io, userId, eventName, payload) {
  try {
    if (!io || !userId) return;
    io.to(String(userId)).emit(eventName, payload);
  } catch (e) {
    console.warn('emitToUser error', e);
  }
}

// -------------------- replace getUserLendings --------------------
// PART B: getUserLendings (replace existing)
const getUserLendings = async (req, res) => {
  try {
    const userId = req.user.id;

    // find lendings where user is either lender or borrower
    const lendings = await Lending.find({
      $or: [{ lender: userId }, { borrower: userId }]
    })
      .populate('book', 'title author')                 // include book title/author
      .populate('lender', 'username name email')        // include lender details
      .populate('borrower', 'username name email')      // include borrower details
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: lendings });
  } catch (err) {
    console.error('getUserLendings error:', err);
    return res.status(500).json({ success: false, message: 'Server error', code: 'SERVER_ERROR' });
  }
};

// -------------------- updated markReturned --------------------
// PART C: markReturned (replace existing)
const markReturned = async (req, res) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;

    const lending = await Lending.findById(id)
      .populate('book', 'title author')
      .populate('lender', 'username name email')
      .populate('borrower', 'username name email');

    if (!lending) {
      return res.status(404).json({ success: false, message: 'Lending not found', code: 'NOT_FOUND' });
    }

    // only lender can mark as returned
    if (String(lending.lender._id) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Only lender can mark returned', code: 'FORBIDDEN' });
    }
    if (lending.status === 'returned') {
      return res.status(400).json({ success: false, message: 'Already marked returned', code: 'ALREADY_RETURNED' });
    }

    lending.status = 'returned';
    lending.returnedOn = new Date();
    await lending.save();

    // create a notification for the borrower
    const Notification = require('../models/Notification');
    const notif = new Notification({
      user: lending.borrower._id,
      actor: userId,
      type: 'lending_returned',
      message: `${lending.lender.username || 'Lender'} marked "${lending.book.title}" as returned.`,
      link: `/lending/${lending._id}`
    });
    const savedNotif = await notif.save();

    // realtime emits
    if (io) {
      io.to(String(lending.borrower._id)).emit('notification', {
        _id: savedNotif._id,
        message: savedNotif.message,
        type: savedNotif.type,
        link: savedNotif.link,
        createdAt: savedNotif.createdAt,
        read: savedNotif.read,
        actor: { _id: userId, username: lending.lender.username }
      });

      io.to(String(lending.lender._id)).emit('lending:updated', { lending });
    }

    return res.json({ success: true, data: lending });
  } catch (err) {
    console.error('markReturned error:', err);
    return res.status(500).json({ success: false, message: 'Server error', code: 'SERVER_ERROR' });
  }
};

// -------------------- updated deleteLending --------------------
// PART D: deleteLending (replace existing)
const deleteLending = async (req, res) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;

    const lending = await Lending.findById(id)
      .populate('book', 'title author')
      .populate('lender', 'username name email')
      .populate('borrower', 'username name email');

    if (!lending) {
      return res.status(404).json({ success: false, message: 'Lending not found', code: 'NOT_FOUND' });
    }

    // only lender may delete
    if (String(lending.lender._id) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Only lender can delete lending', code: 'FORBIDDEN' });
    }

    await Lending.deleteOne({ _id: id });

    // create a notification for the borrower (inform them the lender removed the lending)
    const Notification = require('../models/Notification');
    const notif = new Notification({
      user: lending.borrower._id,
      actor: userId,
      type: 'lending_deleted',
      message: `${lending.lender.username || 'Lender'} removed the lending of "${lending.book ? lending.book.title : lending.bookTitle}".`,
      link: null
    });
    const savedNotif = await notif.save();

    // realtime emits
    if (io) {
      // notify borrower (they may be viewing their lendings)
      io.to(String(lending.borrower._id)).emit('notification', {
        _id: savedNotif._id,
        message: savedNotif.message,
        type: savedNotif.type,
        link: savedNotif.link,
        createdAt: savedNotif.createdAt,
        read: savedNotif.read,
        actor: { _id: userId, username: lending.lender.username }
      });

      // notify lender to remove from their UI
      io.to(String(lending.lender._id)).emit('lending:deleted', { id });

      // optionally notify borrower to remove from their UI as well
      io.to(String(lending.borrower._id)).emit('lending:deleted', { id });
    }

    return res.json({ success: true, message: 'Lending deleted' });
  } catch (err) {
    console.error('deleteLending error:', err);
    return res.status(500).json({ success: false, message: 'Server error', code: 'SERVER_ERROR' });
  }
};

// -------------------- updated getNotifications --------------------
// PART E: getNotifications (replace existing)
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    // fetch the 100 most recent notifications for this user
    const notifs = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ success: true, data: notifs });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ success: false, message: 'Server error', code: 'SERVER_ERROR' });
  }
};

// -------------------- updated markNotificationRead --------------------
// PART E: markNotificationRead (replace existing)
const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notif = await Notification.findById(id);
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found', code: 'NOT_FOUND' });
    }
    if (String(notif.user) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Not allowed', code: 'FORBIDDEN' });
    }

    notif.read = true;
    await notif.save();

    return res.json({ success: true, data: notif });
  } catch (err) {
    console.error('markNotificationRead error:', err);
    return res.status(500).json({ success: false, message: 'Server error', code: 'SERVER_ERROR' });
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

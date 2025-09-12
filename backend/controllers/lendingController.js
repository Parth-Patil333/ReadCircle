// controllers/lendingController.js
const Lending = require('../models/Lending');
const Notification = require('../models/Notification');
const User = require('../models/User'); // if needed

// Create a lending: borrower receives notification
// PART 1: updated createLending
const createLending = async (req, res) => {
  try {
    const io = req.app.get('io'); // socket instance
    const lenderId = req.user.id;
    const { bookTitle, borrowerId, dueDate, notes, bookId } = req.body;

    if (!bookTitle || !borrowerId) {
      return res.status(400).json({ message: 'bookTitle and borrowerId required' });
    }
    if (String(borrowerId) === String(lenderId)) {
      return res.status(400).json({ message: "You can't lend to yourself" });
    }

    // create lending record with lender explicitly set
    const lending = new Lending({
      bookTitle,
      bookId: bookId || null,
      lender: lenderId,
      borrower: borrowerId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      status: 'lent'
    });

    await lending.save();

    // populate lender & borrower for response and notifications
    await lending.populate([
      { path: 'lender', select: 'name email' },
      { path: 'borrower', select: 'name email' }
    ]);

    // create notification for borrower (persisted)
    const actor = lenderId;
    const borrower = borrowerId;
    const lenderUser = await User.findById(lenderId).select('name email');

    const message = `${lenderUser?.name || 'Someone'} lent you "${bookTitle}".`;
    const notification = new Notification({
      user: borrower,
      actor,
      type: 'lending_created',
      message,
      link: `/lending/${lending._id}` // link can be adjusted to your frontend route
    });
    const savedNotif = await notification.save();

    // real-time emit: notify borrower (notification) and lender (update)
    if (io) {
      // send the notification payload to borrower
      io.to(String(borrower)).emit('notification', {
        _id: savedNotif._id,
        message: savedNotif.message,
        type: savedNotif.type,
        link: savedNotif.link,
        createdAt: savedNotif.createdAt,
        read: savedNotif.read,
        actor: lenderUser ? { _id: lenderUser._id, name: lenderUser.name } : { _id: actor }
      });

      // send an event to the lender so their UI can refresh immediately
      // We emit 'lending:created' with the populated lending object.
      io.to(String(lenderId)).emit('lending:created', {
        lending: {
          _id: lending._id,
          bookTitle: lending.bookTitle,
          bookId: lending.bookId || null,
          lender: lending.lender,    // populated object
          borrower: lending.borrower, // populated object
          dueDate: lending.dueDate,
          notes: lending.notes,
          status: lending.status,
          createdAt: lending.createdAt
        }
      });
      // after emitting to lender
      if (io) {
        io.to(String(lenderId)).emit('lending:created', {
          lending: {
            _id: lending._id,
            bookTitle: lending.bookTitle,
            bookId: lending.bookId || null,
            lender: lending.lender,
            borrower: lending.borrower,
            dueDate: lending.dueDate,
            notes: lending.notes,
            status: lending.status,
            createdAt: lending.createdAt
          }
        });

        // debug: log that emit was fired
        console.log('emit lending:created to user room', String(lenderId));

        // optional: log how many sockets are currently in that room (async)
        (async () => {
          try {
            const sockets = await io.in(String(lenderId)).allSockets(); // Set of socket ids
            console.log(`sockets in room ${lenderId}:`, sockets.size, Array.from(sockets).slice(0, 10));
          } catch (err) {
            console.warn('error listing sockets in room', err);
          }
        })();
      }


    }

    // return populated lending to requester (lender)
    return res.status(201).json({ lending });
  } catch (err) {
    console.error('createLending error:', err);
    return res.status(500).json({ message: 'Server error' });
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
const getUserLendings = async (req, res) => {
  try {
    const userId = req.user.id;
    // find lendings where user is lender or borrower, populate both sides
    // and return an array directly (not wrapped in { lendings: [...] })
    const lendings = await Lending.find({
      $or: [{ lender: userId }, { borrower: userId }]
    })
      .populate('lender', 'name email')
      .populate('borrower', 'name email')
      .sort({ createdAt: -1 })
      .lean(); // return plain JS objects which are easier for frontend

    // ensure we return an array in top-level for simplicity
    return res.json(lendings);
  } catch (err) {
    console.error('getUserLendings error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// -------------------- updated markReturned --------------------
const markReturned = async (req, res) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;

    const lending = await Lending.findById(id)
      .populate('lender', 'name email')
      .populate('borrower', 'name email');

    if (!lending) return res.status(404).json({ message: 'Lending not found' });

    if (String(lending.lender._id) !== String(userId)) {
      return res.status(403).json({ message: 'Only lender can mark returned' });
    }
    if (lending.status === 'returned') {
      return res.status(400).json({ message: 'Already marked returned' });
    }

    lending.status = 'returned';
    lending.returnedOn = new Date();
    await lending.save();

    // create a notification for the borrower
    const notif = new Notification({
      user: lending.borrower._id,
      actor: userId,
      type: 'lending_returned',
      message: `${lending.lender.name || 'Lender'} marked "${lending.bookTitle}" as returned.`,
      link: `/lending/${lending._id}`
    });
    const savedNotif = await notif.save();

    // realtime emits
    emitToUser(io, lending.borrower._id, 'notification', {
      _id: savedNotif._id,
      message: savedNotif.message,
      type: savedNotif.type,
      link: savedNotif.link,
      createdAt: savedNotif.createdAt,
      read: savedNotif.read,
      actor: { _id: userId, name: lending.lender.name }
    });
    emitToUser(io, lending.lender._id, 'lending:updated', { lending });

    return res.json({ lending });
  } catch (err) {
    console.error('markReturned error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// -------------------- updated deleteLending --------------------
const deleteLending = async (req, res) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;

    const lending = await Lending.findById(id)
      .populate('lender', 'name email')
      .populate('borrower', 'name email');

    if (!lending) return res.status(404).json({ message: 'Lending not found' });

    if (String(lending.lender._id) !== String(userId)) {
      return res.status(403).json({ message: 'Only lender can delete lending' });
    }

    await Lending.deleteOne({ _id: id });

    // optional notification to borrower
    const notif = new Notification({
      user: lending.borrower._id,
      actor: userId,
      type: 'lending_deleted',
      message: `Lending of "${lending.bookTitle}" was removed by the lender.`,
      link: null
    });
    const savedNotif = await notif.save();

    // realtime emits
    emitToUser(io, lending.borrower._id, 'notification', {
      _id: savedNotif._id,
      message: savedNotif.message,
      type: savedNotif.type,
      link: savedNotif.link,
      createdAt: savedNotif.createdAt,
      read: savedNotif.read,
      actor: { _id: userId }
    });
    emitToUser(io, lending.lender._id, 'lending:deleted', { id });

    return res.json({ message: 'Lending deleted' });
  } catch (err) {
    console.error('deleteLending error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// -------------------- updated getNotifications --------------------
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    // get the 100 most recent notifications for this user
    const notifs = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // normalize response: always return an array at top-level
    return res.json({ notifications: notifs });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// -------------------- updated markNotificationRead --------------------
const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notif = await Notification.findById(id);
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    if (String(notif.user) !== String(userId)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    notif.read = true;
    await notif.save();

    // return updated notification
    return res.json({ notification: notif });
  } catch (err) {
    console.error('markNotificationRead error:', err);
    return res.status(500).json({ message: 'Server error' });
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

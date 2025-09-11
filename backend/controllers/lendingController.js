// controllers/lendingController.js
const Lending = require('../models/Lending');
const Notification = require('../models/Notification');
const User = require('../models/User'); // if needed

// Create a lending: borrower receives notification
const createLending = async (req, res) => {
  try {
    const io = req.app.get('io'); // get io instance
    const lenderId = req.user.id;
    const { bookTitle, borrowerId, dueDate, notes, bookId } = req.body;

    if (!borrowerId || !bookTitle) {
      return res.status(400).json({ message: 'bookTitle and borrowerId required' });
    }
    if (borrowerId === lenderId) {
      return res.status(400).json({ message: "You can't lend to yourself" });
    }

    const lending = new Lending({
      bookTitle,
      bookId: bookId || null,
      lender: lenderId,
      borrower: borrowerId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes
    });

    await lending.save();

    // create notification for borrower
    const actor = lenderId;
    const borrower = borrowerId;
    const lenderUser = await User.findById(lenderId).select('name email');

    const message = `${lenderUser?.name || 'Someone'} lent you "${bookTitle}".`;
    const notification = new Notification({
      user: borrower,
      actor,
      type: 'lending_created',
      message,
      link: `/lendings/${lending._id}`
    });
    const savedNotif = await notification.save();

    // real-time emit (send notification object to borrower room)
    if (io) {
      io.to(String(borrower)).emit('notification', {
        _id: savedNotif._id,
        message: savedNotif.message,
        type: savedNotif.type,
        link: savedNotif.link,
        createdAt: savedNotif.createdAt,
        read: savedNotif.read,
        actor: lenderUser ? { _id: lenderUser._id, name: lenderUser.name } : { _id: actor }
      });
    }

    // Optionally: create notification for lender confirming creation
    /* await new Notification({
      user: lenderId,
      actor,
      type: 'custom',
      message: `You lent "${bookTitle}" to ${borrower}.`,
      link: `/lendings/${lending._id}`
    }).save(); */

    return res.status(201).json({ lending });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get lendings relevant to the user
const getUserLendings = async (req, res) => {
  try {
    const userId = req.user.id;
    // get lendings where user is lender or borrower
    const lendings = await Lending.find({
      $or: [{ lender: userId }, { borrower: userId }]
    }).populate('lender', 'name email').populate('borrower', 'name email').sort({ createdAt: -1 });

    return res.json({ lendings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Mark returned (only lender can do this)
const markReturned = async (req, res) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;
    const lending = await Lending.findById(id);
    if (!lending) return res.status(404).json({ message: 'Lending not found' });

    if (String(lending.lender) !== String(userId)) {
      return res.status(403).json({ message: 'Only lender can mark returned' });
    }
    if (lending.returned) return res.status(400).json({ message: 'Already marked returned' });

    lending.returned = true;
    lending.returnedOn = new Date();
    lending.status = 'returned';
    await lending.save();

    // notify borrower that it's marked returned
    const lenderUser = await User.findById(userId).select('name');
    const notif = new Notification({
      user: lending.borrower,
      actor: userId,
      type: 'lending_returned',
      message: `${lenderUser?.name || 'Lender'} marked "${lending.bookTitle}" as returned.`,
      link: `/lendings/${lending._id}`
    });
    const saved = await notif.save();

    if (io) {
      io.to(String(lending.borrower)).emit('notification', {
        _id: saved._id,
        message: saved.message,
        type: saved.type,
        link: saved.link,
        createdAt: saved.createdAt,
        read: saved.read,
        actor: lenderUser ? { _id: lenderUser._id, name: lenderUser.name } : { _id: userId }
      });
    }

    return res.json({ lending });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Delete lending (only lender)
const deleteLending = async (req, res) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;
    const lending = await Lending.findById(id);
    if (!lending) return res.status(404).json({ message: 'Lending not found' });

    if (String(lending.lender) !== String(userId)) {
      return res.status(403).json({ message: 'Only lender can delete lending' });
    }

    await Lending.deleteOne({ _id: id });

    // create notification for borrower if you want to notify deletion
    const delNotif = await new Notification({
      user: lending.borrower,
      actor: userId,
      type: 'lending_deleted',
      message: `Lending of "${lending.bookTitle}" was removed by the lender.`,
      link: null
    }).save();

    if (io) {
      io.to(String(lending.borrower)).emit('notification', {
        _id: delNotif._id,
        message: delNotif.message,
        type: delNotif.type,
        link: delNotif.link,
        createdAt: delNotif.createdAt,
        read: delNotif.read,
        actor: { _id: userId }
      });
    }

    return res.json({ message: 'Lending deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Notifications: list for user
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifs = await Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(100);
    return res.json({ notifications: notifs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Mark a notification read
const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const notif = await Notification.findById(id);
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    if (String(notif.user) !== String(userId)) return res.status(403).json({ message: 'Not allowed' });

    notif.read = true;
    await notif.save();
    return res.json({ notification: notif });
  } catch (err) {
    console.error(err);
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

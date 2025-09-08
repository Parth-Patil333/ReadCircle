// controllers/lendingController.js
const Lending = require("../models/Lending");
const Notification = require("../models/Notification");
const User = require("../models/User"); // optional, used to fetch usernames for messages

// helper: create a notification for a user
async function createNotification(userId, type, data) {
  try {
    await Notification.create({
      userId,
      type,
      data,
      read: false
    });
  } catch (err) {
    console.error("createNotification error:", err);
    // don't throw — notification failure shouldn't block primary action
  }
}

// Lender creates a lending record (pending or with borrower info)
const createLending = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const { bookTitle, bookAuthor, borrowerId, borrowerName, borrowerContact, dueDate } = req.body;

    if (!bookTitle) return res.status(400).json({ message: "bookTitle required" });

    const lending = new Lending({
      lenderId,
      bookTitle,
      bookAuthor,
      borrowerId: borrowerId || null,
      borrowerName: borrowerName || "",
      borrowerContact: borrowerContact || "",
      dueDate: dueDate ? new Date(dueDate) : null,
      status: borrowerId ? "confirmed" : "pending"
    });

    await lending.save();

    // If lender explicitly assigned a borrower (borrowerId), notify that borrower
    if (lending.borrowerId) {
      const msg = `You were assigned "${lending.bookTitle}" by ${req.user.username || "a lender"}. Due: ${lending.dueDate ? new Date(lending.dueDate).toLocaleDateString() : "Not set"}`;
      createNotification(lending.borrowerId, "lending_assigned", {
        lendingId: lending._id,
        lenderId,
        bookTitle: lending.bookTitle,
        dueDate: lending.dueDate,
        message: msg
      });
    }

    res.status(201).json({ message: "Lending created", lending });
  } catch (err) {
    console.error("createLending:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get lendings created by the logged-in lender
const getMyLendings = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const docs = await Lending.find({ lenderId }).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get items where current user is borrower (confirmed)
const getBorrowed = async (req, res) => {
  try {
    const userId = req.user.id;
    const docs = await Lending.find({ borrowerId: userId }).sort({ dueDate: 1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Borrower confirms a pending lending (claim it)
const confirmBorrow = async (req, res) => {
  try {
    const lendingId = req.params.id;
    const userId = req.user.id;

    const lending = await Lending.findById(lendingId);
    if (!lending) return res.status(404).json({ message: "Lending not found" });
    if (String(lending.lenderId) === String(userId)) {
      return res.status(400).json({ message: "Lender cannot confirm as borrower" });
    }
    if (lending.status === "confirmed") return res.status(400).json({ message: "Already confirmed" });

    // assign borrower
    lending.borrowerId = userId;
    // keep borrowerName if already set, otherwise try to use req.user.username
    lending.borrowerName = lending.borrowerName || req.user.username || "";
    // keep dueDate if lender set it; otherwise set a default, e.g., 14 days
    if (!lending.dueDate) lending.dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    lending.status = "confirmed";
    await lending.save();

    // Notify the lender that someone confirmed their lending
    const lenderMsg = `${req.user.username || "A user"} has confirmed borrowing "${lending.bookTitle}". Due: ${lending.dueDate ? new Date(lending.dueDate).toLocaleDateString() : "Not set"}`;
    createNotification(lending.lenderId, "borrower_confirmed", {
      lendingId: lending._id,
      borrowerId: lending.borrowerId,
      bookTitle: lending.bookTitle,
      dueDate: lending.dueDate,
      message: lenderMsg
    });

    // Optionally notify the borrower that confirmation succeeded (useful if you want a copy)
    const borrowerMsg = `You confirmed borrowing "${lending.bookTitle}". Return by ${lending.dueDate ? new Date(lending.dueDate).toLocaleDateString() : "Not set"}.`;
    createNotification(lending.borrowerId, "borrow_confirmed", {
      lendingId: lending._id,
      lenderId: lending.lenderId,
      bookTitle: lending.bookTitle,
      dueDate: lending.dueDate,
      message: borrowerMsg
    });

    res.json({ message: "Confirmed as borrower", lending });
  } catch (err) {
    console.error("confirmBorrow:", err);
    res.status(500).json({ error: err.message });
  }
};

// Lender marks item returned
const markReturned = async (req, res) => {
  try {
    const lendingId = req.params.id;
    const userId = req.user.id;

    const lending = await Lending.findOne({ _id: lendingId, lenderId: userId });
    if (!lending) return res.status(404).json({ message: "Lending not found or not yours" });

    lending.status = "returned";
    lending.dueDate = null;
    await lending.save();

    // Notify borrower that lender marked returned (optional)
    if (lending.borrowerId) {
      const msg = `"${lending.bookTitle}" was marked returned by the lender.`;
      createNotification(lending.borrowerId, "marked_returned", {
        lendingId: lending._id,
        lenderId: lending.lenderId,
        bookTitle: lending.bookTitle,
        message: msg
      });
    }

    res.json({ message: "Marked returned", lending });
  } catch (err) {
    console.error("markReturned:", err);
    res.status(500).json({ error: err.message });
  }
};

// Lender deletes the lending record
const deleteLending = async (req, res) => {
  try {
    const lendingId = req.params.id;
    const userId = req.user.id;

    const deleted = await Lending.findOneAndDelete({ _id: lendingId, lenderId: userId });
    if (!deleted) return res.status(404).json({ message: "Lending not found or not yours" });

    // Notify borrower that the lending was deleted (if borrower existed)
    if (deleted.borrowerId) {
      const msg = `Lending for "${deleted.bookTitle}" was removed by the lender.`;
      createNotification(deleted.borrowerId, "lending_deleted", {
        lendingId: deleted._id,
        lenderId: deleted.lenderId,
        bookTitle: deleted.bookTitle,
        message: msg
      });
    }

    res.json({ message: "Lending deleted" });
  } catch (err) {
    console.error("deleteLending:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createLending,
  getMyLendings,
  getBorrowed,
  confirmBorrow,
  markReturned,
  deleteLending
};

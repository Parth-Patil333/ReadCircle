// controllers/lendingController.js
const mongoose = require("mongoose");
const Lending = require("../models/Lending");
const Notification = require("../models/Notification");
const User = require("../models/User");

// helpers
function toObjectIdSafe(id) {
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) return mongoose.Types.ObjectId(id);
  return null;
}

// Create lending
const createLending = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const { bookTitle, bookAuthor, borrowerId, borrowerName, dueDate } = req.body;

    if (!bookTitle) return res.status(400).json({ message: "bookTitle required" });

    // Resolve borrowerId robustly:
    // - If a valid ObjectId string was provided -> use it
    // - Else, if a string provided, try to resolve as username/email in users collection
    let finalBorrowerId = null;
    if (borrowerId) {
      if (mongoose.isValidObjectId(borrowerId)) {
        finalBorrowerId = mongoose.Types.ObjectId(borrowerId);
      } else {
        // try username or email lookup
        const maybeUser = await User.findOne({ username: borrowerId }) || await User.findOne({ email: borrowerId });
        if (maybeUser) finalBorrowerId = maybeUser._id;
        else {
          // invalid borrower identifier — return 400 to avoid writing bad type data
          return res.status(400).json({ message: "Invalid borrower identifier. Provide a valid user _id or existing username/email." });
        }
      }
    }

    const lending = new Lending({
      lenderId: mongoose.Types.ObjectId(lenderId),
      bookTitle,
      bookAuthor: bookAuthor || "",
      borrowerId: finalBorrowerId || null,
      borrowerName: borrowerName || "",
      status: finalBorrowerId ? "confirmed" : "pending",
      dueDate: dueDate ? new Date(dueDate) : null
    });

    await lending.save();

    // non-blocking notification to borrower
    if (finalBorrowerId) {
      try {
        await Notification?.create({
          userId: finalBorrowerId,
          fromUserId: lenderId,
          type: "lending_assigned",
          message: `${req.user.username || "A user"} lent you "${bookTitle}".`,
          data: { lendingId: lending._id }
        });
      } catch (err) {
        console.warn("Notification save failed:", err?.message || err);
      }
    }

    return res.status(201).json({ message: "Lending created", lending });
  } catch (err) {
    console.error("createLending error:", err);
    if (err.name === "CastError" && err.kind === "ObjectId") {
      return res.status(400).json({ message: "Invalid ObjectId provided" });
    }
    return res.status(500).json({ error: err.message });
  }
};

// Get lendings where I'm the lender (populates borrower)
const getMyLendings = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const docs = await Lending.find({ lenderId: mongoose.Types.ObjectId(lenderId) })
      .populate("borrowerId", "username email")
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error("getMyLendings error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get lendings where I'm the borrower (populates lender)
const getBorrowed = async (req, res) => {
  try {
    const userId = req.user.id;
    const docs = await Lending.find({ borrowerId: mongoose.Types.ObjectId(userId) })
      .populate("lenderId", "username email")
      .sort({ dueDate: 1, createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error("getBorrowed error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Confirm borrow (borrower claims pending lending)
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

    lending.borrowerId = mongoose.Types.ObjectId(userId);
    lending.borrowerName = lending.borrowerName || req.user.username || "";
    lending.status = "confirmed";
    if (!lending.dueDate) lending.dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await lending.save();

    // notify lender
    try {
      await Notification?.create({
        userId: lending.lenderId,
        fromUserId: userId,
        type: "lending_confirmed",
        message: `${req.user.username || "A user"} confirmed borrowing "${lending.bookTitle}".`,
        data: { lendingId: lending._id }
      });
    } catch (err) { /* ignore */ }

    res.json({ message: "Confirmed as borrower", lending });
  } catch (err) {
    console.error("confirmBorrow error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Mark returned (only lender can)
const markReturned = async (req, res) => {
  try {
    const lendingId = req.params.id;
    const userId = req.user.id;

    const lending = await Lending.findOne({ _id: lendingId, lenderId: mongoose.Types.ObjectId(userId) });
    if (!lending) return res.status(404).json({ message: "Lending not found or not yours" });

    lending.status = "returned";
    lending.dueDate = null;
    await lending.save();

    if (lending.borrowerId) {
      try {
        await Notification?.create({
          userId: lending.borrowerId,
          fromUserId: userId,
          type: "lending_returned",
          message: `Lender marked "${lending.bookTitle}" as returned.`,
          data: { lendingId: lending._id }
        });
      } catch (err) {}
    }

    res.json({ message: "Marked returned", lending });
  } catch (err) {
    console.error("markReturned error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete lending (only lender)
const deleteLending = async (req, res) => {
  try {
    const lendingId = req.params.id;
    const userId = req.user.id;

    const deleted = await Lending.findOneAndDelete({ _id: lendingId, lenderId: mongoose.Types.ObjectId(userId) });
    if (!deleted) return res.status(404).json({ message: "Lending not found or not yours" });

    if (deleted.borrowerId) {
      try {
        await Notification?.create({
          userId: deleted.borrowerId,
          fromUserId: userId,
          type: "lending_deleted",
          message: `Lender deleted the lending record for "${deleted.bookTitle}".`,
          data: { lendingId: deleted._id }
        });
      } catch (err) {}
    }

    res.json({ message: "Lending deleted" });
  } catch (err) {
    console.error("deleteLending error:", err);
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

// controllers/lendingController.js (excerpt)
const mongoose = require("mongoose");
const Lending = require("../models/Lending");
const Notification = require("../models/Notification");
const User = require("../models/User"); // <- required if you want username -> id lookup

const createLending = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const { bookTitle, bookAuthor, borrowerId, borrowerName, borrowerContact, dueDate } = req.body;

    if (!bookTitle) return res.status(400).json({ message: "bookTitle required" });

    // Validate borrowerId if provided
    let finalBorrowerId = null;
    if (borrowerId) {
      // If it's already a valid ObjectId string, accept it
      if (mongoose.isValidObjectId(borrowerId)) {
        finalBorrowerId = borrowerId;
      } else {
        // Optionally try resolving if lender pasted a username/email instead of id
        // If you don't want this behavior, simply return an error instead of attempting to lookup.
        const maybeUser = await User.findOne({ username: borrowerId }) || await User.findOne({ email: borrowerId });
        if (maybeUser) {
          finalBorrowerId = String(maybeUser._id);
        } else {
          return res.status(400).json({ message: "Invalid borrowerId. Provide a valid user _id (24 hex chars) or a username/email that exists." });
        }
      }
    }

    const lending = new Lending({
      lenderId,
      bookTitle,
      bookAuthor,
      borrowerId: finalBorrowerId,
      borrowerName: borrowerName || "",
      borrowerContact: borrowerContact || "",
      dueDate: dueDate ? new Date(dueDate) : null,
      status: finalBorrowerId ? "confirmed" : "pending"
    });

    await lending.save();

    // create notification only if borrower assigned
    if (finalBorrowerId) {
      const notif = new Notification({
        userId: finalBorrowerId,
        fromUserId: lenderId,
        type: "lending_assigned",
        message: `${req.user.username || "A user"} lent you "${bookTitle}".`,
        data: { lendingId: lending._id }
      });
      await notif.save().catch(() => {});
    }

    return res.status(201).json({ message: "Lending created", lending });
  } catch (err) {
    console.error("createLending error:", err);
    // Friendly error message for CastError fallback
    if (err.name === "CastError" && err.kind === "ObjectId") {
      return res.status(400).json({ message: "Invalid ObjectId provided" });
    }
    return res.status(500).json({ error: err.message });
  }
};

// Get lendings created by the logged-in lender
const getMyLendings = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const docs = await Lending.find({ lenderId }).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error("getMyLendings error:", err);
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
    console.error("getBorrowed error:", err);
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

    lending.borrowerId = userId;
    lending.borrowerName = lending.borrowerName || req.user.username || "";
    if (!lending.dueDate) lending.dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    lending.status = "confirmed";
    await lending.save();

    // Optional: notify lender via Notification model if present
    if (Notification) {
      const notif = new Notification({
        userId: lending.lenderId,
        fromUserId: userId,
        type: "lending_confirmed",
        message: `${req.user.username || "A user"} confirmed borrowing "${lending.bookTitle}".`,
        data: { lendingId: lending._id }
      });
      await notif.save().catch(() => {});
    }

    res.json({ message: "Confirmed as borrower", lending });
  } catch (err) {
    console.error("confirmBorrow error:", err);
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

    // optional notif to borrower
    if (lending.borrowerId && Notification) {
      const notif = new Notification({
        userId: lending.borrowerId,
        fromUserId: userId,
        type: "lending_returned",
        message: `Lender marked "${lending.bookTitle}" as returned.`,
        data: { lendingId: lending._id }
      });
      await notif.save().catch(() => {});
    }

    res.json({ message: "Marked returned", lending });
  } catch (err) {
    console.error("markReturned error:", err);
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

    if (deleted.borrowerId && Notification) {
      const notif = new Notification({
        userId: deleted.borrowerId,
        fromUserId: userId,
        type: "lending_deleted",
        message: `Lender deleted the lending record for "${deleted.bookTitle}".`,
        data: { lendingId: deleted._id }
      });
      await notif.save().catch(() => {});
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

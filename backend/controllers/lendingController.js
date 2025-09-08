// controllers/lendingController.js
const Lending = require("../models/Lending");
const Notification = require("../models/Notification"); // optional, only if you use notifications

// Lender creates a lending record (pending or assigned to borrower)
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

    // Optional: create notification if borrowerId present (requires Notification model)
    if (borrowerId && Notification) {
      const notif = new Notification({
        userId: borrowerId,
        fromUserId: lenderId,
        type: "lending_assigned",
        message: `${req.user.username || "A user"} lent you "${bookTitle}".`,
        data: { lendingId: lending._id }
      });
      await notif.save().catch(() => {}); // don't fail lending creation if notif fails
    }

    res.status(201).json({ message: "Lending created", lending });
  } catch (err) {
    console.error("createLending error:", err);
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

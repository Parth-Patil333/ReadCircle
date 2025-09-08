// controllers/lendingController.js
const Lending = require("../models/Lending");
const Notification = require("../models/Notification");

// Lender creates a lending record (if borrowerId provided will be assigned)
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

    // If borrowerId provided, create a notification for the borrower
    if (borrowerId) {
      const notif = new Notification({
        userId: borrowerId,
        fromUserId: lenderId,
        type: "lending_assigned",
        message: `${req.user.username || "Someone"} lent you "${bookTitle}". Please return by ${lending.dueDate ? new Date(lending.dueDate).toLocaleDateString() : "the due date"}.`,
        data: { lendingId: lending._id }
      });
      await notif.save();
    }

    res.status(201).json({ message: "Lending created", lending });
  } catch (err) {
    console.error("createLending error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Borrower confirms a pending lending (claim it)
// (keeps notification creation minimal because lender already has the record)
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

    // Notify the lender that borrower confirmed
    const notif = new Notification({
      userId: lending.lenderId,
      fromUserId: userId,
      type: "lending_confirmed",
      message: `${req.user.username || "A user"} confirmed borrowing "${lending.bookTitle}".`,
      data: { lendingId: lending._id }
    });
    await notif.save();

    res.json({ message: "Confirmed as borrower", lending });
  } catch (err) {
    console.error("confirmBorrow error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Lender marks item returned -> notify borrower
const markReturned = async (req, res) => {
  try {
    const lendingId = req.params.id;
    const userId = req.user.id;

    const lending = await Lending.findOne({ _id: lendingId, lenderId: userId });
    if (!lending) return res.status(404).json({ message: "Lending not found or not yours" });

    lending.status = "returned";
    lending.dueDate = null;
    await lending.save();

    if (lending.borrowerId) {
      const notif = new Notification({
        userId: lending.borrowerId,
        fromUserId: userId,
        type: "lending_returned",
        message: `Lender marked "${lending.bookTitle}" as returned.`,
        data: { lendingId: lending._id }
      });
      await notif.save();
    }

    res.json({ message: "Marked returned", lending });
  } catch (err) {
    console.error("markReturned error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Lender deletes lending -> optionally notify borrower
const deleteLending = async (req, res) => {
  try {
    const lendingId = req.params.id;
    const userId = req.user.id;

    const deleted = await Lending.findOneAndDelete({ _id: lendingId, lenderId: userId });
    if (!deleted) return res.status(404).json({ message: "Lending not found or not yours" });

    if (deleted.borrowerId) {
      const notif = new Notification({
        userId: deleted.borrowerId,
        fromUserId: userId,
        type: "lending_deleted",
        message: `Lender deleted the lending record for "${deleted.bookTitle}".`,
        data: { lendingId: deleted._id }
      });
      await notif.save();
    }

    res.json({ message: "Lending deleted" });
  } catch (err) {
    console.error("deleteLending error:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createLending,
  // ... other functions (getMyLendings, getBorrowed) unchanged
  confirmBorrow,
  markReturned,
  deleteLending
};

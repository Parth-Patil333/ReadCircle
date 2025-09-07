const Lending = require("../models/Lending");

// Lender creates a lending record (pending or with borrower info)
const createLending = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const { bookTitle, bookAuthor, borrowerName, borrowerContact, dueDate } = req.body;

    if (!bookTitle) return res.status(400).json({ message: "bookTitle required" });

    const lending = new Lending({
      lenderId,
      bookTitle,
      bookAuthor,
      borrowerName: borrowerName || "",
      borrowerContact: borrowerContact || "",
      dueDate: dueDate ? new Date(dueDate) : null,
      status: borrowerName ? "confirmed" : "pending"
    });

    await lending.save();
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
    lending.borrowerName = lending.borrowerName || req.user.username || ""; // optional
    // keep dueDate if lender set it; otherwise set a default, e.g., 14 days
    if (!lending.dueDate) lending.dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    lending.status = "confirmed";
    await lending.save();
    res.json({ message: "Confirmed as borrower", lending });
  } catch (err) {
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
    res.json({ message: "Marked returned", lending });
  } catch (err) {
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
    res.json({ message: "Lending deleted" });
  } catch (err) {
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

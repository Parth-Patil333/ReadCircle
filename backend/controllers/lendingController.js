const mongoose = require("mongoose");
const Lending = require("../models/Lending");

// ----------------- Create Lending -----------------
const createLending = async (req, res) => {
  try {
    const { bookTitle, bookAuthor, borrowerId, dueDate } = req.body;

    if (!bookTitle) {
      return res.status(400).json({ error: "Book title is required" });
    }

    const lending = new Lending({
      bookTitle,
      bookAuthor,
      lenderId: req.user.id,
      status: "confirmed", // directly confirmed since lender chooses borrower
      dueDate: dueDate || null,
    });

    if (borrowerId) {
      if (mongoose.isValidObjectId(borrowerId)) {
        lending.borrowerId = new mongoose.Types.ObjectId(borrowerId);
      } else {
        return res.status(400).json({ error: "Invalid borrowerId format" });
      }
    }

    await lending.save();
    res.status(201).json({ message: "Lending created", lending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ----------------- My Lendings (I'm the lender) -----------------
const getMyLendings = async (req, res) => {
  try {
    const lendings = await Lending.find({ lenderId: req.user.id })
      .populate("borrowerId", "username email")
      .sort({ createdAt: -1 });

    res.json(lendings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ----------------- Items I Borrowed (I'm borrower) -----------------
const getBorrowed = async (req, res) => {
  try {
    const lendings = await Lending.find({ borrowerId: req.user.id })
      .populate("lenderId", "username email")
      .sort({ createdAt: -1 });

    res.json(lendings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ----------------- Mark Returned (Lender only) -----------------
const markReturned = async (req, res) => {
  try {
    const { id } = req.params;

    const lending = await Lending.findOne({
      _id: id,
      lenderId: req.user.id, // lender only
    });

    if (!lending) {
      return res.status(404).json({ error: "Lending not found or not yours" });
    }

    lending.status = "returned";
    await lending.save();

    res.json({ message: "Book marked as returned", lending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ----------------- Delete Lending (Lender only) -----------------
const deleteLending = async (req, res) => {
  try {
    const { id } = req.params;

    const lending = await Lending.findOneAndDelete({
      _id: id,
      lenderId: req.user.id,
    });

    if (!lending) {
      return res.status(404).json({ error: "Lending not found or not yours" });
    }

    res.json({ message: "Lending deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createLending,
  getMyLendings,
  getBorrowed,
  markReturned,
  deleteLending,
};

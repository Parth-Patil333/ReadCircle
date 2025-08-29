const Lending = require('../models/Lending');

// Add a new lending record
const addLending = async (req, res) => {
  try {
    const { bookTitle, borrowerName, borrowerContact, dueDate } = req.body;
    const lending = new Lending({ bookTitle, borrowerName, borrowerContact, dueDate });
    await lending.save();
    res.status(201).json({ message: 'Book lent successfully', lending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all lending records
const getLendings = async (req, res) => {
  try {
    const lendings = await Lending.find().sort({ createdAt: -1 });
    res.json(lendings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark as returned
const markReturned = async (req, res) => {
  try {
    const { id } = req.params;
    const lending = await Lending.findByIdAndUpdate(
      id, { status: 'returned' }, { new: true }
    );
    if (!lending) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Book marked as returned', lending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete lending record
const deleteLending = async (req, res) => {
  try {
    const { id } = req.params;
    const lending = await Lending.findByIdAndDelete(id);
    if (!lending) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Lending record deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get overdue books
const getOverdueBooks = async (req, res) => {
  try {
    const today = new Date();
    const overdue = await Lending.find({ dueDate: { $lt: today }, status: 'lent' });
    res.json(overdue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get books due within next 3 days
const getDueSoonBooks = async (req, res) => {
  try {
    const today = new Date();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(today.getDate() + 3);

    const dueSoon = await Lending.find({
      dueDate: { $gte: today, $lte: threeDaysLater },
      status: 'lent'
    });

    res.json(dueSoon);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  addLending,
  getLendings,
  markReturned,
  deleteLending,
  getOverdueBooks,
  getDueSoonBooks
};

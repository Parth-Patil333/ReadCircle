const Book = require("../models/Books");

// Add book (scoped to user)
const addBook = async (req, res) => {
  try {
    const { title, author, status, condition } = req.body;
    const userId = req.user.id;
    const book = new Book({ userId, title, author, status, condition });
    await book.save();
    res.status(201).json({ message: "Book added", book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all books for logged-in user
const getBooks = async (req, res) => {
  try {
    const userId = req.user.id;
    const books = await Book.find({ userId }).sort({ createdAt: -1 });
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update book (only owner)
const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updates = req.body;
    const book = await Book.findOneAndUpdate({ _id: id, userId }, updates, { new: true });
    if (!book) return res.status(404).json({ message: "Book not found or not yours" });
    res.json({ message: "Book updated", book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete book (only owner)
const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const book = await Book.findOneAndDelete({ _id: id, userId });
    if (!book) return res.status(404).json({ message: "Book not found or not yours" });
    res.json({ message: "Book deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { addBook, getBooks, updateBook, deleteBook };

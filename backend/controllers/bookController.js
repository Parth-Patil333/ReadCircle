// controllers/bookController.js
const Book = require("../models/Books");

// Add book (scoped to user)
const addBook = async (req, res) => {
  try {
    const { title, author, status, condition, bookCoverUrl } = req.body;
    const userId = req.user.id;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Title is required", code: "VALIDATION_ERROR" });
    }

    const book = new Book({ userId, title: title.trim(), author, status, condition, bookCoverUrl });
    await book.save();

    // socket emit
    try {
      const io = req.app && req.app.get ? req.app.get("io") : global.__io;
      if (io) {
        io.to(String(userId)).emit("inventory-updated", {
          type: "book-added",
          userId,
          book: { id: book._id, title: book.title, author: book.author }
        });
      }
    } catch (e) {
      console.error("socket emit failed", e);
    }

    res.status(201).json({ success: true, message: "Book added", data: book });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: "SERVER_ERROR" });
  }
};

// Get all books for logged-in user
const getBooks = async (req, res) => {
  try {
    const userId = req.user.id;
    const books = await Book.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: books });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: "SERVER_ERROR" });
  }
};

// Update book (only owner)
const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updates = req.body;
    const book = await Book.findOneAndUpdate({ _id: id, userId }, updates, { new: true });
    if (!book) return res.status(404).json({ success: false, message: "Book not found or not yours", code: "NOT_FOUND" });
    res.json({ success: true, message: "Book updated", data: book });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: "SERVER_ERROR" });
  }
};

// Delete book (only owner)
const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const book = await Book.findOneAndDelete({ _id: id, userId });
    if (!book) return res.status(404).json({ success: false, message: "Book not found or not yours", code: "NOT_FOUND" });

    // socket emit
    try {
      const io = req.app && req.app.get ? req.app.get("io") : global.__io;
      if (io) {
        io.to(String(userId)).emit("inventory-updated", {
          type: "book-deleted",
          userId,
          bookId: book._id
        });
      }
    } catch (e) {
      console.error("socket emit failed", e);
    }

    res.json({ success: true, message: "Book deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: "SERVER_ERROR" });
  }
};

module.exports = { addBook, getBooks, updateBook, deleteBook };

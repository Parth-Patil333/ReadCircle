const Book = require('../models/Books');

// Add a book
const addBook = async (req, res) => {
  try {
    const { title, author, status } = req.body;
    const newBook = new Book({ title, author, status });
    await newBook.save();
    res.status(201).json({ message: 'Book added successfully', book: newBook });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all books
const getBooks = async (req, res) => {
  try {
    const books = await Book.find();
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update book status
const updateBookStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const book = await Book.findByIdAndUpdate(id, { status }, { new: true });
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.json({ message: 'Book status updated', book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a book
const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;
    const book = await Book.findByIdAndDelete(id);
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.json({ message: 'Book deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { addBook, getBooks, updateBookStatus, deleteBook };

const express = require('express');
const router = express.Router();
const { addBook, getBooks, updateBookStatus, deleteBook } = require('../controllers/bookController');
const auth = require("../middleware/auth");

// Add new book
router.post('/', auth, addBook);

// Get all books
router.get('/', auth, getBooks);

// Update book status
router.put('/:id', auth, updateBookStatus);

// Delete a book
router.delete('/:id', auth, deleteBook);

module.exports = router;

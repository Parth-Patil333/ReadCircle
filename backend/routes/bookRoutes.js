const express = require('express');
const router = express.Router();
const { addBook, getBooks, updateBookStatus, deleteBook } = require('../controllers/bookController');

// Add new book
router.post('/', addBook);

// Get all books
router.get('/', getBooks);

// Update book status
router.put('/:id', updateBookStatus);

// Delete a book
router.delete('/:id', deleteBook);

module.exports = router;

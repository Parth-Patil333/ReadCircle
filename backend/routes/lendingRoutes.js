const express = require('express');
const router = express.Router();
const {
  addLending,
  getLendings,
  markReturned,
  deleteLending,
  getOverdueBooks,
  getDueSoonBooks
} = require('../controllers/lendingController');

// Add lending
router.post('/', addLending);

// Get all lendings
router.get('/', getLendings);

// Mark returned
router.put('/:id/return', markReturned);

// Delete record
router.delete('/:id', deleteLending);

// Get overdue books
router.get('/overdue', getOverdueBooks);

// Get books due soon (next 3 days)
router.get('/due-soon', getDueSoonBooks);

module.exports = router;

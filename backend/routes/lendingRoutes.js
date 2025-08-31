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
const auth = require("../middleware/auth");

// Add lending
router.post('/', auth, addLending);

// Get all lendings
router.get('/', auth, getLendings);

// Mark returned
router.put('/:id/return', auth, markReturned);

// Delete record
router.delete('/:id',auth, deleteLending);

// Get overdue books
router.get('/overdue', auth, getOverdueBooks);

// Get books due soon (next 3 days)
router.get('/due-soon', auth, getDueSoonBooks);

module.exports = router;

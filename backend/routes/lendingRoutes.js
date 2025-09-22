// routes/lendingRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const {
  createLending,
  getUserLendings,
  markReturned,
  deleteLending
} = require('../controllers/lendingController');

// Create lending
// routes/lendingRoutes.js — replace POST block with:
router.post('/',
  auth,
  (req, res, next) => {
    // allow either bookId or bookTitle; borrowerId required
    const { bookId, bookTitle, borrowerId } = req.body || {};
    if (!borrowerId) {
      return res.status(400).json({ success: false, message: 'borrowerId is required', code: 'VALIDATION_ERROR' });
    }
    if (!bookId && !bookTitle) {
      return res.status(400).json({ success: false, message: 'Either bookId or bookTitle is required', code: 'VALIDATION_ERROR' });
    }
    return next();
  },
  createLending
);


// Get lendings for logged-in user
router.get('/', auth, getUserLendings);

// Mark returned
router.patch('/:id/return', auth, markReturned);

// Delete lending
router.delete('/:id', auth, deleteLending);

module.exports = router;

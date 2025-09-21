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
router.post('/',
  auth,
  [
    body('bookId').notEmpty().withMessage('bookId is required'),
    body('borrowerId').notEmpty().withMessage('borrowerId is required')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array(), code: 'VALIDATION_ERROR' });
    }
    return createLending(req, res, next);
  }
);

// Get lendings for logged-in user
router.get('/', auth, getUserLendings);

// Mark returned
router.patch('/:id/return', auth, markReturned);

// Delete lending
router.delete('/:id', auth, deleteLending);

module.exports = router;

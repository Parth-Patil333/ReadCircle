const express = require('express');
const router = express.Router();
const { addLending, getLendings, markReturned, deleteLending } = require('../controllers/lendingController');

// Add lending
router.post('/', addLending);

// Get all lendings
router.get('/', getLendings);

// Mark returned
router.put('/:id/return', markReturned);

// Delete record
router.delete('/:id', deleteLending);

module.exports = router;

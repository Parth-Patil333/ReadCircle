const express = require('express');
const router = express.Router();
const { addEntry, getEntries, updateEntry, deleteEntry } = require('../controllers/journalController');

// Add new entry
router.post('/', addEntry);

// Get all entries
router.get('/', getEntries);

// Update entry
router.put('/:id', updateEntry);

// Delete entry
router.delete('/:id', deleteEntry);

module.exports = router;

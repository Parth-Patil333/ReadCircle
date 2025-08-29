const express = require('express');
const router = express.Router();
const { setHabit, getHabit, updateProgress } = require('../controllers/habitController');

// Set or update goal
router.post('/', setHabit);

// Get habit
router.get('/', getHabit);

// Update progress
router.put('/progress', updateProgress);

module.exports = router;

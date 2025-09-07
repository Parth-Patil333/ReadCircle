const express = require('express');
const router = express.Router();
const { setHabit, getHabit, updateProgress, deleteHabit } = require('../controllers/habitController');
const auth = require("../middleware/auth");

// Set or update goal
router.post('/', auth, setHabit);

// Get habit
router.get('/', auth, getHabit);

// Update progress
router.put('/progress', auth, updateProgress);

// Delete habit (for current user)
router.delete('/', auth, deleteHabit);

module.exports = router;

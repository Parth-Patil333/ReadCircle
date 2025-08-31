const express = require('express');
const router = express.Router();
const { setHabit, getHabit, updateProgress } = require('../controllers/habitController');
const auth = require("../middleware/auth");

// Set or update goal
router.post('/', auth, setHabit);

// Get habit
router.get('/', auth, getHabit);

// Update progress
router.put('/progress', auth, updateProgress);

module.exports = router;

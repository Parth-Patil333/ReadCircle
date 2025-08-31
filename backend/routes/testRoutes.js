const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const auth = require("../middleware/auth");

// POST - Add a test entry
router.post('/', async (req, res) => {
  try {
    const newTest = new Test({ name: req.body.name });
    await newTest.save();
    res.status(201).json({ message: 'Test entry created', data: newTest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - Get all test entries
router.get('/', async (req, res) => {
  try {
    const tests = await Test.find();
    res.json(tests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

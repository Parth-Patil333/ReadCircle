// routes/profileRoutes.js
const express = require('express');
const router = express.Router();

const profileController = require('../controllers/profileController');
const requireAuth = require('../middleware/auth'); // your auth middleware

// These routes are protected — frontend expects /api/profile
router.get('/', requireAuth, profileController.getProfile);
router.patch('/', requireAuth, profileController.updateProfile);

module.exports = router;

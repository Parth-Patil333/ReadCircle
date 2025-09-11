// routes/lendings.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // your JWT auth middleware
const {
  createLending,
  getUserLendings,
  markReturned,
  deleteLending,
  getNotifications,
  markNotificationRead
} = require('../controllers/lendingController');

router.post('/', auth, createLending);
router.get('/', auth, getUserLendings);
router.patch('/:id/return', auth, markReturned);
router.delete('/:id', auth, deleteLending);

// notifications
router.get('/notifications', auth, getNotifications); // or put in /api/notifications
router.patch('/notifications/:id/read', auth, markNotificationRead);

module.exports = router;

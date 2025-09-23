// routes/booklistingRoutes.js
const express = require('express');
const router = express.Router();

const controller = require('../controllers/booklistingController');

// Auth middleware (your provided file: middleware/auth.js)
const requireAuth = require('../middleware/auth');

// Public
router.get('/', controller.getListings);
router.get('/:id', controller.getListing);

// Protected (create / modify / reservation flows)
router.post('/', requireAuth, controller.createListing);
router.patch('/:id', requireAuth, controller.updateListing);
router.delete('/:id', requireAuth, controller.deleteListing);

// Reservation / confirm / cancel
router.post('/:id/reserve', requireAuth, controller.reserveListing);
router.post('/:id/confirm', requireAuth, controller.confirmSale);
router.post('/:id/cancel', requireAuth, controller.cancelReservation);

module.exports = router;

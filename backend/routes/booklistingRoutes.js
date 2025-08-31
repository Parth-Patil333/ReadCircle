const express = require('express');
const router = express.Router();
const {
  addListing,
  getListings,
  updateListing,
  deleteListing,
  confirmListing,
  cancelListing,
  cleanupListings
} = require('../controllers/booklistingController');
const auth = require("../middleware/auth");

// Add listing
router.post('/', auth, addListing);

// Get all available listings
router.get('/', auth, getListings);

// Update listing
router.put('/:id', auth, updateListing);

// Delete listing
router.delete('/:id', auth, deleteListing);

// Confirm listing
router.put('/:id/confirm', auth, confirmListing);

// Cancel confirmed listing
router.put('/:id/cancel', auth, cancelListing);

// Manual cleanup trigger
router.delete("/cleanup", auth, cleanupListings);


module.exports = router;

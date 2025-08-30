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

// Add listing
router.post('/', addListing);

// Get all available listings
router.get('/', getListings);

// Update listing
router.put('/:id', updateListing);

// Delete listing
router.delete('/:id', deleteListing);

// Confirm listing
router.put('/:id/confirm', confirmListing);

// Cancel confirmed listing
router.put('/:id/cancel', cancelListing);

// Manual cleanup trigger
router.delete("/cleanup", cleanupListings);


module.exports = router;

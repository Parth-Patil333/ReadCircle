const mongoose = require('mongoose');

const bookListingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: String,
  condition: { type: String, enum: ['New', 'Good', 'Fair', 'Poor'], default: 'Good' },
  sellerName: { type: String, required: true },
  sellerContact: { type: String, required: true },
  sellerAddress: { type: String, required: true },
  status: { type: String, enum: ['available', 'confirmed', 'sold'], default: 'available' },
  confirmedAt: { type: Date, default: null }, // for auto-delete after 48 hrs
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BookListing', bookListingSchema);

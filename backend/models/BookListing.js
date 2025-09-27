// models/BookListing.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * BookListing
 * - Minimal version for buying/selling
 *
 * Fields:
 *  - title (required)
 *  - author (optional)
 *  - condition: enum
 *  - price: number (0 = free / negotiable)
 *  - currency: default "INR"
 *  - images: array of URLs (strings)
 *  - sellerId: ObjectId ref User (required)
 *  - sellerContact: optional string (phone/email)
 *  - buyerId: ObjectId ref User (set when reserved)
 *  - reservedAt / reservedUntil: Date range for reservation window
 *  - createdAt, updatedAt: timestamps
 */

const VALID_CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor'];

const BookListingSchema = new Schema({
  title: { type: String, required: true, trim: true },
  author: { type: String, trim: true, default: '' },
  condition: { type: String, enum: VALID_CONDITIONS, default: 'Good' },
  price: { type: Number, min: 0, default: 0 },
  currency: { type: String, default: 'INR', trim: true },
  images: [{ type: String, trim: true }],
  sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sellerContact: { type: String, trim: true },
  buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
  reservedAt: { type: Date },
  reservedUntil: { type: Date }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true }
});

// Virtual: timeLeft for reserved listings
BookListingSchema.virtual('reservedTimeLeftMs').get(function() {
  if (!this.reservedUntil) return null;
  const left = this.reservedUntil.getTime() - Date.now();
  return left > 0 ? left : 0;
});

// Indexes for performance
BookListingSchema.index({ title: 'text', author: 'text' });
BookListingSchema.index({ sellerId: 1 });
BookListingSchema.index({ reservedUntil: 1 });

module.exports = mongoose.model('BookListing', BookListingSchema);

// models/Lending.js
const mongoose = require('mongoose');

const LendingSchema = new mongoose.Schema({
  bookTitle: { type: String, required: true },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: false }, // optional if you have Book collection
  lender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lentOn: { type: Date, default: Date.now },
  dueDate: { type: Date },
  returned: { type: Boolean, default: false },
  returnedOn: { type: Date },
  notes: { type: String },
  status: {
    type: String,
    enum: ['lent', 'returned', 'cancelled'],
    default: 'lent'
  }
}, { timestamps: true });

module.exports = mongoose.model('Lending', LendingSchema);

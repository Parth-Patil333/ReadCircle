const mongoose = require('mongoose');

const lendingSchema = new mongoose.Schema({
  bookTitle: { type: String, required: true },
  borrowerName: { type: String, required: true },
  borrowerContact: { type: String, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['lent', 'returned'], default: 'lent' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lending', lendingSchema);

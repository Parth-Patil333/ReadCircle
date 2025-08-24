const mongoose = require('mongoose');

const journalEntrySchema = new mongoose.Schema({
  title: { type: String, required: true },       // Entry title
  content: { type: String, required: true },     // User’s reflection
  tags: { type: [String], default: [] },         // e.g., ["insightful", "motivational"]
  date: { type: Date, default: Date.now }        // Auto-filled
});

module.exports = mongoose.model('JournalEntry', journalEntrySchema);

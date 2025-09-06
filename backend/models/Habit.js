const mongoose = require('mongoose');

const habitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // added
  goalType: { type: String, enum: ['pages', 'minutes'], required: true },
  goalValue: { type: Number, required: true }, // e.g., 20 pages OR 30 minutes
  progress: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: null }
});

module.exports = mongoose.model('Habit', habitSchema);

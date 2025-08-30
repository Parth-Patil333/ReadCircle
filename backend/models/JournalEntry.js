const mongoose = require("mongoose");

const journalEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  tags: [{ type: String }], // e.g., ["insightful", "emotional"]
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("JournalEntry", journalEntrySchema);

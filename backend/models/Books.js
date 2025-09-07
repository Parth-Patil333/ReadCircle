const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // owner
  title: { type: String, required: true },
  author: { type: String },
  status: { type: String, enum: ["To Read", "Reading", "Finished"], default: "To Read" },
  condition: { type: String }, // optional (for selling/listings)
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Book", bookSchema);

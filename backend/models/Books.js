const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // owner
  title: { type: String, required: true, trim: true },
  author: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["To Read", "Reading", "Finished"], default: "To Read" },
  condition: { type: String, trim: true, default: "" }, // optional (for selling/listings)
  bookCoverUrl: { type: String, trim: true, default: "" } // NEW
}, {
  timestamps: true
});

// helpful index for owner + title
bookSchema.index({ userId: 1, title: 1 });

module.exports = mongoose.model("Book", bookSchema);

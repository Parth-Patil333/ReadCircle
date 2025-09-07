const mongoose = require("mongoose");

const lendingSchema = new mongoose.Schema({
  lenderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // owner (lender)
  bookTitle: { type: String, required: true },
  bookAuthor: { type: String },
  borrowerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // filled when borrower confirms
  borrowerName: { type: String, default: "" }, // optional free text
  borrowerContact: { type: String, default: "" }, // optional free text / phone
  status: { type: String, enum: ["pending", "confirmed", "returned"], default: "pending" },
  dueDate: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

// virtual
lendingSchema.virtual("isOverdue").get(function() {
  if (!this.dueDate || this.status === "returned") return false;
  return new Date() > this.dueDate;
});

module.exports = mongoose.model("Lending", lendingSchema);

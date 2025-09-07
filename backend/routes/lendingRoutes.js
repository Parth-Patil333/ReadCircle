const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  createLending,
  getMyLendings,
  getBorrowed,
  confirmBorrow,
  markReturned,
  deleteLending
} = require("../controllers/lendingController");

// Lender creates a lending record
router.post("/", auth, createLending);

// Get lendings created by me (lender)
router.get("/", auth, getMyLendings);

// Get items where I'm the borrower
router.get("/borrowed", auth, getBorrowed);

// Borrower confirms a lending (claim)
router.post("/confirm/:id", auth, confirmBorrow);

// Lender marks returned
router.post("/return/:id", auth, markReturned);

// Lender deletes a lending record
router.delete("/:id", auth, deleteLending);

module.exports = router;

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

// import controllers properly
const {
  createLending,
  getMyLendings,
  getBorrowed,
  markReturned,
  deleteLending,
} = require("../controllers/lendingController");

// Create lending (lender adds record)
router.post("/", auth, createLending);

// Get my lendings (as lender)
router.get("/", auth, getMyLendings);

// Get borrowed items (as borrower)
router.get("/borrowed", auth, getBorrowed);

// Mark returned (lender only)
router.post("/return/:id", auth, markReturned);

// Delete lending (lender only)
router.delete("/:id", auth, deleteLending);

module.exports = router;

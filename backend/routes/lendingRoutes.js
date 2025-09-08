// routes/lendingRoutes.js
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

router.post("/", auth, createLending);
router.get("/", auth, getMyLendings);
router.get("/borrowed", auth, getBorrowed);
router.post("/confirm/:id", auth, confirmBorrow);
router.post("/return/:id", auth, markReturned);
router.delete("/:id", auth, deleteLending);

module.exports = router;

// routes/dashboardRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth"); // update path if your auth middleware is elsewhere
const { getMyLendings } = require("../controllers/dashboardController");

// GET /api/my-lendings?page=1&limit=20&role=lender|borrower|both
router.get("/my-lendings", auth, getMyLendings);

module.exports = router;

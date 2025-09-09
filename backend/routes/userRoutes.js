// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { searchUsers } = require("../controllers/userController");

// protected search (only logged-in users)
router.get("/", auth, searchUsers);

module.exports = router;

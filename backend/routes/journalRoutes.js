const express = require("express");
const router = express.Router();
const { addEntry, getEntries, updateEntry, deleteEntry } = require("../controllers/journalController");
const auth = require("../middleware/auth");

// CRUD routes for journal
router.post("/", auth, addEntry);
router.get("/", auth, getEntries);
router.put("/:id", auth, updateEntry);
router.delete("/:id", auth, deleteEntry);

module.exports = router;

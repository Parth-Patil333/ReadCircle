const express = require("express");
const router = express.Router();
const { addEntry, getEntries, updateEntry, deleteEntry } = require("../controllers/journalController");

// CRUD routes for journal
router.post("/", addEntry);
router.get("/", getEntries);
router.put("/:id", updateEntry);
router.delete("/:id", deleteEntry);

module.exports = router;

const JournalEntry = require("../models/JournalEntry");

// Add new journal entry
const addEntry = async (req, res) => {
  try {
    const { title, content, tags } = req.body;
    const entry = new JournalEntry({
      userId: req.user.id, // comes from JWT auth middleware
      title,
      content,
      tags
    });
    await entry.save();
    res.json({ message: "Journal entry added", entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all journal entries of logged-in user
const getEntries = async (req, res) => {
  try {
    const entries = await JournalEntry.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update journal entry
const updateEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tags } = req.body;

    const entry = await JournalEntry.findOneAndUpdate(
      { _id: id, userId: req.user.id }, // only owner can update
      { title, content, tags },
      { new: true }
    );

    if (!entry) return res.status(404).json({ message: "Entry not found or not yours" });
    res.json({ message: "Journal entry updated", entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete journal entry
const deleteEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await JournalEntry.findOneAndDelete({
      _id: id,
      userId: req.user.id // only owner can delete
    });

    if (!result) return res.status(404).json({ message: "Entry not found or not yours" });
    res.json({ message: "Journal entry deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { addEntry, getEntries, updateEntry, deleteEntry };

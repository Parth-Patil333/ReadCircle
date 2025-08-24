const JournalEntry = require('../models/JournalEntry');

// Add new journal entry
const addEntry = async (req, res) => {
  try {
    const { title, content, tags } = req.body;
    const entry = new JournalEntry({ title, content, tags });
    await entry.save();
    res.status(201).json({ message: 'Journal entry added', entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all journal entries
const getEntries = async (req, res) => {
  try {
    const entries = await JournalEntry.find().sort({ date: -1 });
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
    const entry = await JournalEntry.findByIdAndUpdate(
      id, { title, content, tags }, { new: true }
    );
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    res.json({ message: 'Journal entry updated', entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete journal entry
const deleteEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await JournalEntry.findByIdAndDelete(id);
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    res.json({ message: 'Journal entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { addEntry, getEntries, updateEntry, deleteEntry };

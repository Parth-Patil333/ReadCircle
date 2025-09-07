const Habit = require('../models/Habit');

// Create or update a habit goal (scoped to user)
const setHabit = async (req, res) => {
  try {
    const { goalType, goalValue } = req.body;
    const userId = req.user.id;

    if (!goalType || !goalValue || goalValue <= 0) {
      return res.status(400).json({ message: "goalType and positive goalValue required" });
    }

    let habit = await Habit.findOne({ userId });

    if (habit) {
      habit.goalType = goalType;
      habit.goalValue = goalValue;
      await habit.save();
      return res.json({ message: 'Habit updated', habit });
    }

    habit = new Habit({ userId, goalType, goalValue });
    await habit.save();
    res.status(201).json({ message: 'Habit created', habit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get habit for logged-in user
const getHabit = async (req, res) => {
  try {
    const userId = req.user.id;
    const habit = await Habit.findOne({ userId });
    if (!habit) return res.json({ message: 'No habit set' });
    res.json(habit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update daily progress for logged-in user
const updateProgress = async (req, res) => {
  try {
    const { progress } = req.body;
    const userId = req.user.id;

    if (typeof progress !== "number" || isNaN(progress) || progress <= 0) {
      return res.status(400).json({ message: "Invalid progress value" });
    }

    let habit = await Habit.findOne({ userId });
    if (!habit) return res.status(404).json({ message: 'No habit set' });

    const today = new Date().toDateString();
    const last = habit.lastUpdated ? habit.lastUpdated.toDateString() : null;

    if (last === today) {
      // Same day → add to progress
      habit.progress += progress;
    } else {
      // New day → check streak
      if (habit.progress >= habit.goalValue) {
        habit.streak += 1;
      } else {
        habit.streak = 0;
      }
      habit.progress = progress;
    }

    habit.lastUpdated = new Date();
    await habit.save();
    res.json({ message: 'Progress updated', habit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete habit for current user (so they can create a fresh one)
const deleteHabit = async (req, res) => {
  try {
    const userId = req.user.id;
    const habit = await Habit.findOneAndDelete({ userId });
    if (!habit) return res.status(404).json({ message: 'No habit to delete' });
    res.json({ message: 'Habit deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { setHabit, getHabit, updateProgress, deleteHabit };

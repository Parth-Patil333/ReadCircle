const Habit = require('../models/Habit');

// Create or update a habit goal
const setHabit = async (req, res) => {
  try {
    const { goalType, goalValue } = req.body;
    let habit = await Habit.findOne();

    if (habit) {
      habit.goalType = goalType;
      habit.goalValue = goalValue;
      await habit.save();
      return res.json({ message: 'Habit updated', habit });
    }

    habit = new Habit({ goalType, goalValue });
    await habit.save();
    res.status(201).json({ message: 'Habit created', habit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get habit
const getHabit = async (req, res) => {
  try {
    const habit = await Habit.findOne();
    if (!habit) return res.json({ message: 'No habit set' });
    res.json(habit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update daily progress
const updateProgress = async (req, res) => {
  try {
    const { progress } = req.body;
    let habit = await Habit.findOne();
    if (!habit) return res.status(404).json({ message: 'No habit set' });

    const today = new Date().toDateString();
    const last = habit.lastUpdated ? habit.lastUpdated.toDateString() : null;

    if (last === today) {
      // Same day → just update progress
      habit.progress += progress;
    } else {
      // New day → reset progress
      if (habit.progress >= habit.goalValue) {
        habit.streak += 1; // keep streak
      } else {
        habit.streak = 0; // reset streak
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

module.exports = { setHabit, getHabit, updateProgress };

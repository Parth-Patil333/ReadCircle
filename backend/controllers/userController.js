// controllers/userController.js
const User = require("../models/User");

// GET /api/users?search=term
// Returns list of users (limit 10) matching username or email (case-insensitive)
const searchUsers = async (req, res) => {
  try {
    const q = (req.query.search || "").trim();
    if (!q) return res.json([]); // empty query => empty list (frontend won't call unless >1 char)

    // simple regex search on username or email
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = await User.find({
      $or: [{ username: regex }, { email: regex }]
    })
      .limit(10)
      .select("_id username email");

    res.json(users);
  } catch (err) {
    console.error("searchUsers error:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { searchUsers };

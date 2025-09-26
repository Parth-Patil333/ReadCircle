// controllers/authController.js
// Minimal patch: use utils/jwt.signToken so tokens always include `id` claim and use centralized secret.
// Behavior otherwise preserved (register + login return same shapes, expiry remains 1h)

const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwtUtil = require("../utils/jwt");

// Register
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ username, email, password: hashedPassword });
    await user.save();

    // Use centralized jwt helper, keep 1h expiry to match previous behavior
    const token = jwtUtil.signToken(user, { expiresIn: "1h" });

    res.json({ message: "User registered", token });
  } catch (err) {
    console.error("auth.register error:", err && err.message ? err.message : err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

// Login (username + password only)
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwtUtil.signToken(user, { expiresIn: "1h" });

    res.json({ message: "Login successful", token });
  } catch (err) {
    console.error("auth.login error:", err && err.message ? err.message : err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

module.exports = { register, login };

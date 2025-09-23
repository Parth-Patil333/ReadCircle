// controllers/profileController.js (enhanced)
const User = require('../models/User');
const sanitize = (s) => (typeof s === 'string' ? s.trim() : s);

// small email regex (reasonable for validation; not RFC-perfect)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// username rule: 3-30 chars, letters, numbers, underscore, dot, hyphen
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

const notify = require('../utils/notify'); // optional: for realtime profile updates

const getProfile = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const user = await User.findById(userId).select('-password -__v').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('profileController.getProfile error:', err);
    return res.status(500).json({ success: false, message: 'Server error', code: 'SERVER_ERROR' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Allowed fields
    const allowed = ['username', 'name', 'bio', 'location', 'avatarUrl', 'email', 'stats'];
    const updates = {};

    for (const key of allowed) {
      if (typeof req.body[key] !== 'undefined') updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields provided for update' });
    }

    // Validate & sanitize simple fields
    if (updates.username !== undefined) {
      const u = sanitize(updates.username);
      if (!u || !USERNAME_RE.test(u)) {
        return res.status(400).json({ success: false, message: 'Invalid username format' });
      }
      updates.username = u;
    }
    if (updates.email !== undefined) {
      const e = sanitize(updates.email);
      if (!EMAIL_RE.test(e)) {
        return res.status(400).json({ success: false, message: 'Invalid email address' });
      }
      updates.email = e.toLowerCase();
    }
    if (updates.name !== undefined) {
      updates.name = sanitize(updates.name || '');
      if (updates.name.length > 60) updates.name = updates.name.slice(0, 60);
    }
    if (updates.bio !== undefined) {
      updates.bio = sanitize(updates.bio || '');
      if (updates.bio.length > 1000) updates.bio = updates.bio.slice(0, 1000);
    }
    if (updates.location !== undefined) {
      updates.location = sanitize(updates.location || '');
      if (updates.location.length > 120) updates.location = updates.location.slice(0, 120);
    }
    if (updates.avatarUrl !== undefined) {
      updates.avatarUrl = sanitize(updates.avatarUrl || '');
    }

    // Stats: merge numeric fields instead of overwriting entire stats object
    if (updates.stats && typeof updates.stats === 'object') {
      const statsAllowed = ['titlesCount', 'pagesRead', 'lendingCount'];
      const sanitizedStats = {};
      for (const s of statsAllowed) {
        if (typeof updates.stats[s] !== 'undefined') {
          const n = Number(updates.stats[s]);
          sanitizedStats[s] = Number.isNaN(n) ? 0 : n;
        }
      }
      // Use $set for nested fields in update
      // We'll apply sanitizedStats via $set on 'stats.field'
      const setOps = {};
      for (const [k, v] of Object.entries(sanitizedStats)) {
        setOps[`stats.${k}`] = v;
      }

      // Run update with $set merge
      let updatedUser = null;
      try {
        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $set: { ...updates, ...setOps } },
          { new: true, runValidators: true, context: 'query' }
        ).select('-password -__v');
      } catch (err) {
        // Move to general error handling below
        throw err;
      }

      if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

      // Emit profile updated notification to the user (optional)
      try {
        notify.user(req, userId, 'profile_updated', { userId, username: updatedUser.username });
      } catch (e) { /* ignore notify errors */ }

      return res.json({ success: true, data: updatedUser, message: 'Profile updated' });
    }

    // No stats merging: simple $set update
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true, context: 'query' }
    ).select('-password -__v');

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    // Emit profile updated notification to the user (optional)
    try {
      notify.user(req, userId, 'profile_updated', { userId, username: updatedUser.username });
    } catch (e) {}

    return res.json({ success: true, data: updatedUser, message: 'Profile updated' });
  } catch (err) {
    console.error('profileController.updateProfile error:', err);

    if (err && err.code === 11000) {
      const key = err.keyValue ? Object.keys(err.keyValue)[0] : null;
      if (key === 'username') {
        return res.status(409).json({ success: false, message: 'Username already taken', code: 'USERNAME_TAKEN' });
      }
      if (key === 'email') {
        return res.status(409).json({ success: false, message: 'Email already taken', code: 'EMAIL_TAKEN' });
      }
      return res.status(409).json({ success: false, message: 'Duplicate value', code: 'DUPLICATE_KEY' });
    }

    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Server error',
      code: err.code || 'SERVER_ERROR'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile
};

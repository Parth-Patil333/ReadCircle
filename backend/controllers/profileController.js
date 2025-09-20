// controllers/profileController.js
const User = require('../models/User');

/**
 * GET /api/profile
 * Returns the current user's profile (excludes password)
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const user = await User.findById(userId).select('-password -__v');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('profileController.getProfile error:', err);
    // standardized server error response
    return res.status(500).json({ success: false, message: 'Server error', code: 'SERVER_ERROR' });
  }
};

/**
 * PATCH /api/profile
 * Updates allowed profile fields:
 * - username, name, bio, location, avatarUrl, email
 * - optionally partial stats object: { stats: { titlesCount, pagesRead, lendingCount } }
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // allowed top-level fields to update
    const allowed = ['username', 'name', 'bio', 'location', 'avatarUrl', 'email', 'stats'];
    const updates = {};

    for (const key of allowed) {
      if (typeof req.body[key] !== 'undefined') {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields provided for update' });
    }

    // If stats provided, ensure only allowed numeric fields set inside stats
    if (updates.stats && typeof updates.stats === 'object') {
      const statsAllowed = ['titlesCount', 'pagesRead', 'lendingCount'];
      const sanitizedStats = {};
      for (const s of statsAllowed) {
        if (typeof updates.stats[s] !== 'undefined') {
          // coerce to Number if possible
          const n = Number(updates.stats[s]);
          sanitizedStats[s] = Number.isNaN(n) ? 0 : n;
        }
      }
      updates.stats = sanitizedStats;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true, context: 'query' }
    ).select('-password -__v');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({ success: true, data: user, message: 'Profile updated' });
    } catch (err) {
    console.error('profileController.updateProfile error:', err);

    // Duplicate key (unique index) handling
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

    // Other errors -> standardized server error (preserve status if set)
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

// routes/profile.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/auth'); // adjust path if needed

const { body, validationResult } = require('express-validator');

// GET /api/profile
router.get('/', auth, profileController.getProfile);

// PATCH /api/profile with validation
router.patch('/',
  auth,
  [
    body('username')
      .optional()
      .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email')
      .optional()
      .isEmail().withMessage('Invalid email address'),
    body('name')
      .optional()
      .isString().isLength({ max: 60 }).withMessage('Name too long (max 60)'),
    body('bio')
      .optional()
      .isLength({ max: 500 }).withMessage('Bio too long (max 500 chars)'),
    body('location')
      .optional()
      .isString().isLength({ max: 100 }).withMessage('Location too long (max 100 chars)')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        errors: errors.array()
      });
    }
    return profileController.updateProfile(req, res, next);
  }
);

module.exports = router;

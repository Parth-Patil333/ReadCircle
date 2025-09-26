// routes/booklistingRoutes.js
// Routes for BookListing with optional rate-limiting and debug logging.
// - Keeps same public/protected endpoints as before
// - If express-rate-limit is installed, light rate limits are applied to write endpoints
// - Enable DEBUG_ROUTES=1 for request logging

const express = require('express');
const router = express.Router();

const controller = require('../controllers/booklistingController');
const requireAuth = require('../middleware/auth');

// Optional rate limiter (best-effort): use if package available
let createLimiter = (req, res, next) => next();
let reserveLimiter = (req, res, next) => next();

try {
  const rateLimit = require('express-rate-limit');

  createLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 6, // allow 6 create attempts per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, slow down.' }
  });

  reserveLimiter = rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 8, // allow 8 reserve attempts per 10s per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many reserve attempts, slow down.' }
  });
} catch (e) {
  // express-rate-limit not installed; skip rate limiting
  // No-op
}

// Simple debug logger middleware
function debugLogger(req, res, next) {
  if (process.env.DEBUG_ROUTES === '1') {
    try {
      console.debug(`[routes/booklisting] ${req.method} ${req.originalUrl} from ${req.ip}`);
    } catch (e) {}
  }
  next();
}

router.use(debugLogger);

// Public
router.get('/', controller.getListings);
router.get('/:id', controller.getListing);

// Protected (create / modify / reservation flows)
// Apply createLimiter to POST / to mitigate automated spamming of listings
router.post('/', requireAuth, createLimiter, controller.createListing);
router.patch('/:id', requireAuth, controller.updateListing);
router.delete('/:id', requireAuth, controller.deleteListing);

// Reservation / confirm / cancel
router.post('/:id/reserve', requireAuth, reserveLimiter, controller.reserveListing);
router.post('/:id/confirm', requireAuth, controller.confirmSale);
router.post('/:id/cancel', requireAuth, controller.cancelReservation);

module.exports = router;

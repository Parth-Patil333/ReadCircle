// cron/cleanup.js
// @ts-nocheck
const cron = require('node-cron');
const BookListing = require('../models/BookListing');
const notify = require('../utils/notify');

const SCHEDULE = '*/30 * * * *'; // every 30 minutes

async function runCleanupOnce() {
  try {
    const now = new Date();

    const expired = await BookListing.find({
      buyerId: { $exists: true, $ne: null },
      reservedUntil: { $lte: now },
      $or: [
        { 'meta.soldAt': { $exists: false } },
        { 'meta.soldAt': null }
      ]
    }).exec();

    if (!expired || expired.length === 0) {
      console.log('🧹 Cleanup: No expired reserved listings to delete.');
      return { processed: 0, listings: [] };
    }

    console.log(`🧹 Cleanup: Found ${expired.length} expired reserved listing(s) to delete.`);

    const processed = [];

    for (const listing of expired) {
      const listingId = listing._id;
      const oldBuyerId = listing.buyerId ? String(listing.buyerId) : null;
      const sellerId = listing.sellerId ? String(listing.sellerId) : null;

      try {
        await BookListing.deleteOne({ _id: listingId });

        // Emit notifications (best-effort)
        try {
          if (oldBuyerId) {
            notify.user(null, oldBuyerId, 'listing_cancelled', {
              listingId,
              reason: 'reservation_expired_deleted'
            });
          }
          if (sellerId) {
            notify.user(null, sellerId, 'reservation_expired_deleted', { listingId });
          }
          notify.broadcastListings(null, 'listing_deleted', { id: listingId });
        } catch (emitErr) {
          console.warn('Cleanup: notify emit failed for listing', listingId, emitErr && emitErr.message ? emitErr.message : emitErr);
        }

        console.log(`🧹 Cleanup: Deleted expired listing ${listingId}`);
        processed.push(String(listingId));
      } catch (delErr) {
        console.error(`❌ Cleanup: Failed to delete listing ${listingId}:`, delErr && delErr.message ? delErr.message : delErr);
      }
    }

    console.log(`🧹 Cleanup: Processed and deleted ${processed.length} listing(s).`);
    return { processed: processed.length, listings: processed };
  } catch (err) {
    console.error('❌ Cleanup error:', err && err.message ? err.message : err);
    throw err;
  }
}

function startScheduler() {
  cron.schedule(SCHEDULE, () => {
    runCleanupOnce().catch((e) => {
      console.error('Cleanup scheduler caught error:', e && e.message ? e.message : e);
    });
  });
  console.log(`🧹 Cleanup scheduler started (every 30 minutes): ${SCHEDULE}`);
}

// Exports for controlled start and testing
module.exports = {
  start: startScheduler,
  runOnce: runCleanupOnce
};

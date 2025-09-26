// cron/cleanup.js
// Improved cleanup: archive instead of hard delete
// - Clears reservation fields when expired
// - Adds meta.reservationExpiredAt
// - Emits events to notify buyer, seller, and broadcast listings
// - Use env CLEANUP_DELETE=1 to restore old hard-delete behavior

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
      console.log('🧹 Cleanup: No expired reserved listings to process.');
      return { processed: 0, listings: [] };
    }

    console.log(`🧹 Cleanup: Found ${expired.length} expired reserved listing(s).`);

    const processed = [];
    const hardDelete = process.env.CLEANUP_DELETE === '1';

    for (const listing of expired) {
      const listingId = listing._id;
      const oldBuyerId = listing.buyerId ? String(listing.buyerId) : null;
      const sellerId = listing.sellerId ? String(listing.sellerId) : null;

      try {
        if (hardDelete) {
          await BookListing.deleteOne({ _id: listingId });
          console.log(`🧹 Cleanup: Hard deleted expired listing ${listingId}`);
        } else {
          // Archive mode: clear buyer/reservation, add meta.reservationExpiredAt
          listing.buyerId = undefined;
          listing.reservedAt = undefined;
          listing.reservedUntil = undefined;
          listing.meta = listing.meta || {};
          listing.meta.reservationExpiredAt = new Date();
          await listing.save();
          console.log(`🧹 Cleanup: Cleared expired reservation on listing ${listingId}`);
        }

        // Emit notifications (best-effort)
        try {
          if (oldBuyerId) {
            notify.user(null, oldBuyerId, 'listing_cancelled', {
              listingId,
              reason: hardDelete ? 'reservation_expired_deleted' : 'reservation_expired_cleared'
            });
          }
          if (sellerId) {
            notify.user(null, sellerId, hardDelete ? 'reservation_expired_deleted' : 'reservation_expired_cleared', { listingId });
          }
          notify.broadcastListings(null, hardDelete ? 'listing_deleted' : 'listing_updated', hardDelete ? { id: listingId } : listing.toObject());
        } catch (emitErr) {
          console.warn('Cleanup: notify emit failed for listing', listingId, emitErr && emitErr.message ? emitErr.message : emitErr);
        }

        processed.push(String(listingId));
      } catch (delErr) {
        console.error(`❌ Cleanup: Failed to process listing ${listingId}:`, delErr && delErr.message ? delErr.message : delErr);
      }
    }

    console.log(`🧹 Cleanup: Processed ${processed.length} listing(s).`);
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

module.exports = {
  start: startScheduler,
  runOnce: runCleanupOnce
};

// cron/cleanup.js
const cron = require("node-cron");
const mongoose = require("mongoose");
const BookListing = require("../models/BookListing");
const notify = require("../utils/notify");

/**
 * Auto-delete expired reserved listings
 *
 * - Runs every 30 minutes (*/30 * * * *);
 * - Finds listings where:
 *     buyerId exists AND reservedUntil <= now AND (meta.soldAt does NOT exist)
 * - Deletes those listings and emits:
 *     notify.user(oldBuyerId, 'listing_cancelled', { listingId, reason: 'reservation_expired_deleted' })
 *     notify.user(sellerId, 'reservation_expired_deleted', { listingId })
 *     notify.broadcastListings('listing_deleted', { id: listingId })
 *
 * WARNING: This permanently deletes documents. For production, consider keeping an audit or soft-delete.
 */ 

const SCHEDULE = "*/30 * * * *"; // every 30 minutes

cron.schedule(SCHEDULE, async () => {
  try {
    const now = new Date();

    // Find expired reserved listings that are NOT confirmed sold (no meta.soldAt)
    const expired = await BookListing.find({
      buyerId: { $exists: true, $ne: null },
      reservedUntil: { $lte: now },
      $or: [
        { "meta.soldAt": { $exists: false } },
        { "meta.soldAt": null }
      ]
    }).exec();

    if (!expired || expired.length === 0) {
      console.log("🧹 Cleanup: No expired reserved listings to delete.");
      return;
    }

    console.log(`🧹 Cleanup: Found ${expired.length} expired reserved listing(s) to delete.`);

    // Delete them one-by-one so we can emit notifications per item
    for (const listing of expired) {
      const listingId = listing._id;
      const oldBuyerId = listing.buyerId ? String(listing.buyerId) : null;
      const sellerId = listing.sellerId ? String(listing.sellerId) : null;

      try {
        // delete the document
        await BookListing.deleteOne({ _id: listingId });

        // Emit notifications
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

          // Broadcast to listing watchers
          notify.broadcastListings(null, 'listing_deleted', { id: listingId });
        } catch (emitErr) {
          console.warn('Cleanup: notify emit failed for listing', listingId, emitErr && emitErr.message ? emitErr.message : emitErr);
        }

        console.log(`🧹 Cleanup: Deleted expired listing ${listingId}`);
      } catch (delErr) {
        console.error(`❌ Cleanup: Failed to delete listing ${listingId}:`, delErr && delErr.message ? delErr.message : delErr);
      }
    }

    console.log(`🧹 Cleanup: Processed and deleted ${expired.length} listing(s).`);
  } catch (err) {
    console.error("❌ Cleanup error:", err && err.message ? err.message : err);
  }
});

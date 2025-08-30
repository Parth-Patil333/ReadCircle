const cron = require("node-cron");
const BookListing = require("../models/BookListing");

// Run every day at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hrs ago

    const result = await BookListing.deleteMany({
      status: "confirmed",
      confirmedAt: { $lt: cutoff }
    });

    if (result.deletedCount > 0) {
      console.log(`🧹 Cleanup: Removed ${result.deletedCount} expired listings.`);
    } else {
      console.log("🧹 Cleanup: No expired listings found.");
    }
  } catch (err) {
    console.error("❌ Cleanup error:", err);
  }
});

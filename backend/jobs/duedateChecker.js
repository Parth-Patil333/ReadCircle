// jobs/dueDateChecker.js
// Day 24: Background job to check due dates on lendings and create notifications.
// Minimal changes only: use notify.user(...) correctly (was calling notify(...) directly).
// Safe: does not modify your lending model file, only reads documents and creates notifications.

const cron = require("node-cron");
const Lending = require("../models/Lending");
const { createNotificationIfNotExists } = require("../services/notificationService");
const notify = require("../utils/notify"); // notify.user(...) is used below

/**
 * checkDueDates
 * - Finds overdue lendings (dueDate < now, status not returned)
 * - Sends overdue notifications to borrower & lender (DB + realtime)
 * - Finds lendings due in 2 days, sends reminder to borrower (DB + realtime)
 */
async function checkDueDates() {
  try {
    const now = new Date();

    // Overdue lendings: dueDate < now and status != returned
    const overdue = await Lending.find({
      dueDate: { $lt: now },
      status: { $ne: "returned" }
    }).populate("lender", "name username email").populate("borrower", "name username email");

    for (const lend of overdue) {
      const title = lend.bookTitle || (lend.book && lend.book.title) || "a book";

      // borrower notification (DB)
      if (lend.borrower) {
        const userId = lend.borrower._id || lend.borrower;
        const message = `Your lending for "${title}" is overdue (due ${lend.dueDate.toDateString()}).`;
        await createNotificationIfNotExists({
          userId,
          type: "overdue",
          message,
          data: { lendingId: lend._id }
        });

        // realtime emit (if socket server available) — use notify.user correctly
        try {
          notify.user(userId, "notification", {
            type: "overdue",
            message,
            data: { lendingId: lend._id }
          });
        } catch (e) {
          console.error("Failed to emit overdue notification to borrower:", e);
        }
      }

      // lender notification (DB)
      if (lend.lender) {
        const userId = lend.lender._id || lend.lender;
        const message = `The book "${title}" you lent out is overdue.`;
        await createNotificationIfNotExists({
          userId,
          type: "overdue",
          message,
          data: { lendingId: lend._id }
        });

        // realtime emit (if socket server available) — use notify.user correctly
        try {
          notify.user(userId, "notification", {
            type: "overdue",
            message,
            data: { lendingId: lend._id }
          });
        } catch (e) {
          console.error("Failed to emit overdue notification to lender:", e);
        }
      }
    }

    // Reminders: due in 2 days
    const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(twoDaysLater);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(twoDaysLater);
    endOfDay.setHours(23, 59, 59, 999);

    const dueSoon = await Lending.find({
      dueDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: "returned" }
    }).populate("borrower", "name username email");

    for (const lend of dueSoon) {
      const title = lend.bookTitle || (lend.book && lend.book.title) || "a book";

      if (lend.borrower) {
        const userId = lend.borrower._id || lend.borrower;
        const message = `Reminder: "${title}" is due on ${lend.dueDate.toDateString()}.`;

        await createNotificationIfNotExists({
          userId,
          type: "reminder",
          message,
          data: { lendingId: lend._id }
        });

        // realtime emit — use notify.user correctly
        try {
          notify.user(userId, "notification", {
            type: "reminder",
            message,
            data: { lendingId: lend._id }
          });
        } catch (e) {
          console.error("Failed to emit due-soon notification to borrower:", e);
        }
      }
    }

    console.log(
      `DueDateChecker ran: ${overdue.length} overdue, ${dueSoon.length} due-soon lendings`
    );
  } catch (err) {
    console.error("DueDateChecker error:", err);
  }
}

/**
 * startScheduler
 * - Schedules job to run daily at 2 AM IST
 * - Runs once immediately on server start
 */
function startScheduler() {
  cron.schedule(
    "0 2 * * *",
    () => {
      console.log("Running dueDateChecker at", new Date().toISOString());
      checkDueDates().catch((err) => console.error(err));
    },
    { timezone: "Asia/Kolkata" }
  );

  // Run once immediately at startup
  checkDueDates().catch((err) => console.error(err));
}

module.exports = { checkDueDates, startScheduler };

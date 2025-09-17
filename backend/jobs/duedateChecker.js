// jobs/dueDateChecker.js
// Day 24: Background job to check due dates on lendings and create notifications.
// Safe: does not modify your lending model file, only reads documents and creates notifications.

const cron = require("node-cron");
const Lending = require("../models/Lending");
const { createNotificationIfNotExists } = require("../services/notificationService");

/**
 * checkDueDates
 * - Finds overdue lendings (dueDate < now, status not returned)
 * - Sends overdue notifications to borrower & lender
 * - Finds lendings due in 2 days, sends reminder to borrower
 */
async function checkDueDates() {
  try {
    const now = new Date();

    // Overdue lendings: dueDate < now and status != returned
    const overdue = await Lending.find({
      dueDate: { $lt: now },
      status: { $ne: "returned" }
    }).populate("lender", "name email").populate("borrower", "name email");

    for (const lend of overdue) {
      const title = lend.bookTitle || (lend.book && lend.book.title) || "a book";

      // borrower notification
      if (lend.borrower) {
        await createNotificationIfNotExists({
          userId: lend.borrower._id || lend.borrower,
          type: "overdue",
          message: `Your lending for "${title}" is overdue (due ${lend.dueDate.toDateString()}).`,
          data: { lendingId: lend._id }
        });
      }

      // lender notification
      if (lend.lender) {
        await createNotificationIfNotExists({
          userId: lend.lender._id || lend.lender,
          type: "overdue",
          message: `The book "${title}" you lent out is overdue.`,
          data: { lendingId: lend._id }
        });
      }
    }

    // Reminders: due in 2 days
    const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(twoDaysLater.setHours(0, 0, 0, 0));
    const endOfDay = new Date(twoDaysLater.setHours(23, 59, 59, 999));

    const dueSoon = await Lending.find({
      dueDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: "returned" }
    }).populate("borrower", "name email");

    for (const lend of dueSoon) {
      const title = lend.bookTitle || (lend.book && lend.book.title) || "a book";

      if (lend.borrower) {
        await createNotificationIfNotExists({
          userId: lend.borrower._id || lend.borrower,
          type: "reminder",
          message: `Reminder: "${title}" is due on ${lend.dueDate.toDateString()}.`,
          data: { lendingId: lend._id }
        });
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

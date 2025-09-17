// controllers/dashboardController.js
// Read-only "My Lendings" endpoint for Day 24 dashboard
// This file uses your existing models/Lending.js schema (fields: lender, borrower, dueDate, status)

const Lending = require("../models/Lending");

/**
 * GET /api/my-lendings
 * Query params:
 *   - page (default 1)
 *   - limit (default 20)
 *   - role: "lender" | "borrower" | "both" (default "both")
 *
 * Response:
 *   { items: [ { id, bookTitle, dueDate, status, lender, borrower, createdAt, raw } ], total, page, limit }
 */
const getMyLendings = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 200);
    const skip = (page - 1) * limit;
    const role = (req.query.role || "both").toLowerCase();

    // Build filter using your schema's field names: lender, borrower
    let filter;
    if (role === "lender") {
      filter = { lender: userId };
    } else if (role === "borrower") {
      filter = { borrower: userId };
    } else {
      filter = { $or: [{ lender: userId }, { borrower: userId }] };
    }

    // Query lendings (populate lender & borrower for nicer UI)
    const query = Lending.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // populate if possible (lean + populate requires execPopulate pattern; do two queries to keep it simple)
    // We'll perform populate via normal find (no lean) if populate is needed for fields
    const rawDocs = await Lending.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("lender", "name email")
      .populate("borrower", "name email")
      .exec();

    const total = await Lending.countDocuments(filter);

    // Normalize response for frontend
    const items = rawDocs.map((doc) => {
      const obj = doc.toObject ? doc.toObject() : doc;
      return {
        id: obj._id || obj.id,
        bookTitle: obj.bookTitle || (obj.book && obj.book.title) || null,
        bookId: obj.bookId || (obj.book && obj.book._id) || null,
        dueDate: obj.dueDate || null,
        status: obj.status || (obj.returned ? "returned" : "lent"),
        lender: obj.lender || obj.lenderId || null,
        borrower: obj.borrower || obj.borrowerId || null,
        lentOn: obj.lentOn || obj.createdAt || null,
        returnedOn: obj.returnedOn || null,
        notes: obj.notes || null,
        raw: obj
      };
    });

    return res.json({ items, total, page, limit });
  } catch (err) {
    console.error("getMyLendings error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getMyLendings };

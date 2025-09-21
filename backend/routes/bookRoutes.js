const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { addBook, getBooks, updateBook, deleteBook } = require("../controllers/bookController");
const { body, validationResult } = require("express-validator");

// Add book with validation
router.post("/",
  auth,
  [body("title").exists().notEmpty().withMessage("Title is required")],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: "Validation error", errors: errors.array(), code: "VALIDATION_ERROR" });
    }
    return addBook(req, res, next);
  }
);

// Get all books (for logged-in user)
router.get("/", auth, getBooks);

// Update book
router.put("/:id", auth, updateBook);

// Delete book
router.delete("/:id", auth, deleteBook);

module.exports = router;

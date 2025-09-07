const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { addBook, getBooks, updateBook, deleteBook } = require("../controllers/bookController");

router.post("/", auth, addBook);
router.get("/", auth, getBooks);
router.put("/:id", auth, updateBook);
router.delete("/:id", auth, deleteBook);

module.exports = router;

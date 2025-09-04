// books.js (protected page)
const API_BASE_URL = "https://readcircle.onrender.com/api";

// ✅ gate the page + get a valid token
const token = requireAuth();

// --- Add Book ---
document.getElementById('addBookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value;
  const author = document.getElementById('author').value;
  const status = document.getElementById('status').value;

  try {
    const res = await authFetch(`${API_BASE_URL}/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, author, status })
    });
    const data = await res.json();
    alert(data.message || "Book added");
    loadBooks();
    document.getElementById('addBookForm').reset();
  } catch (err) {
    console.error(err);
    alert("Failed to add book");
  }
});

// --- Load Books ---
async function loadBooks() {
  try {
    const res = await authFetch(`${API_BASE_URL}/books`, { method: 'GET' });
    const books = await res.json();
    const list = document.getElementById('bookList');
    list.innerHTML = '';
    books.forEach(book => {
      const li = document.createElement('li');
      li.textContent = `${book.title} by ${book.author || "Unknown"} - ${book.status}`;
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load books");
  }
}

// Load on page open
loadBooks();

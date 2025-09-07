const API_BASE_URL = "https://readcircle.onrender.com/api";
requireAuth();

let editingBookId = null;

// Submit add/update
document.getElementById("bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("bookTitle").value.trim();
  const author = document.getElementById("bookAuthor").value.trim();
  const status = document.getElementById("bookStatus").value;
  const condition = document.getElementById("bookCondition").value.trim();

  if (!title) { alert("Title required"); return; }

  try {
    let res;
    const payload = { title, author, status, condition };

    if (editingBookId) {
      res = await authFetch(`${API_BASE_URL}/books/${editingBookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      res = await authFetch(`${API_BASE_URL}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const text = await res.text();
      alert("Error: " + text);
      return;
    }

    const data = await res.json();
    alert(data.message || (editingBookId ? "Book updated" : "Book added"));

    // reset form
    document.getElementById("bookForm").reset();
    editingBookId = null;
    document.querySelector("#bookForm button").textContent = "Add Book";

    loadBooks();
  } catch (err) {
    console.error(err);
    alert("Failed to save book");
  }
});

// Load books
async function loadBooks() {
  try {
    const res = await authFetch(`${API_BASE_URL}/books`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || res.statusText);
    }
    const books = await res.json();
    const list = document.getElementById("booksList");
    list.innerHTML = "";

    books.forEach(b => {
      const card = document.createElement("div");
      card.className = "book-card";

      card.innerHTML = `
        <h4>${escapeHtml(b.title)}</h4>
        <p>${escapeHtml(b.author || "Unknown")}</p>
        <p>Status: <strong>${b.status}</strong></p>
        <p>Added: ${new Date(b.createdAt).toLocaleDateString()}</p>
      `;

      const editBtn = document.createElement("button");
      editBtn.className = "btn edit-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => startEditBook(b));

      const delBtn = document.createElement("button");
      delBtn.className = "btn delete-btn";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteBook(b._id));

      card.appendChild(editBtn);
      card.appendChild(delBtn);

      list.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load books");
  }
}

function startEditBook(book) {
  editingBookId = book._id;
  document.getElementById("bookTitle").value = book.title;
  document.getElementById("bookAuthor").value = book.author || "";
  document.getElementById("bookStatus").value = book.status || "To Read";
  document.getElementById("bookCondition").value = book.condition || "";
  document.querySelector("#bookForm button").textContent = "Update Book";
}

async function deleteBook(id) {
  if (!confirm("Delete this book?")) return;
  try {
    const res = await authFetch(`${API_BASE_URL}/books/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text();
      alert("Error: " + t);
      return;
    }
    const d = await res.json();
    alert(d.message || "Deleted");
    loadBooks();
  } catch (err) {
    console.error(err);
    alert("Failed to delete book");
  }
}

// tiny helper to avoid XSS when injecting text
function escapeHtml(text) {
  return (text || "").replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// bootstrap
loadBooks();

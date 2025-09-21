// js_files/bookshelf.js (updated)
// ------------------------------
const API_BASE_URL = "https://readcircle.onrender.com/api";
requireAuth();

let editingBookId = null;

// tiny helper to avoid XSS when injecting text
function escapeHtml(text) {
  return (text || "").replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// small toast helper (non-blocking)
function toast(msg) {
  if (!msg) return;
  const t = document.createElement('div');
  t.className = 'notif-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => t.classList.remove('visible'), 2500);
  setTimeout(() => t.remove(), 3000);
}

// safe JSON parsing helper
async function safeParseJson(res) {
  if (!res) return null;
  const ct = res.headers && res.headers.get ? res.headers.get('content-type') || '' : '';
  if (!ct.includes('application/json')) {
    try {
      const text = await res.text();
      return { __raw: text };
    } catch (e) {
      return null;
    }
  }
  try {
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Submit add/update
const bookForm = document.getElementById("bookForm");
if (bookForm) {
  bookForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = (document.getElementById("bookTitle").value || '').trim();
    const author = (document.getElementById("bookAuthor").value || '').trim();
    const status = (document.getElementById("bookStatus").value || '').trim();
    const condition = (document.getElementById("bookCondition").value || '').trim();

    if (!title) { toast("Title required"); return; }

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

      const parsed = await safeParseJson(res);
      if (!res.ok || (parsed && parsed.success === false)) {
        // Try to show a helpful message
        const msg = (parsed && (parsed.message || (Array.isArray(parsed.errors) ? parsed.errors.map(x => x.msg).join('; ') : undefined))) || (parsed && parsed.__raw) || `Error (${res.status})`;
        alert("Error: " + msg);
        return;
      }

      // success path: server might return { success, data } or legacy { message, book }
      const message = (parsed && (parsed.message || (parsed.data && parsed.data.message))) || (parsed && parsed.__raw) || (editingBookId ? "Book updated" : "Book added");
      toast(message);

      // reset form
      bookForm.reset();
      editingBookId = null;
      const btn = document.querySelector("#bookForm button");
      if (btn) btn.textContent = "Add Book";

      await loadBooks();
    } catch (err) {
      console.error(err);
      alert("Failed to save book");
    }
  });
}

// Load books
async function loadBooks() {
  try {
    const res = await authFetch(`${API_BASE_URL}/books`);
    if (!res) {
      throw new Error('No response from server');
    }

    const parsed = await safeParseJson(res);
    // support: either an array or { success:true, data: [...] }
    let books = [];
    if (Array.isArray(parsed)) books = parsed;
    else if (parsed && parsed.success && Array.isArray(parsed.data)) books = parsed.data;
    else if (parsed && Array.isArray(parsed.data)) books = parsed.data;
    else if (Array.isArray(parsed?.books)) books = parsed.books;
    else if (Array.isArray(parsed?.items)) books = parsed.items;
    else {
      // if parsed contains a single array property, use that
      const firstArr = Object.values(parsed || {}).find(v => Array.isArray(v));
      if (Array.isArray(firstArr)) books = firstArr;
    }

    const list = document.getElementById("booksList");
    if (!list) return;
    list.innerHTML = "";

    if (!books.length) {
      list.innerHTML = "<p>No books in your inventory.</p>";
      return;
    }

    books.forEach(b => {
      const card = document.createElement("div");
      card.className = "book-card";

      card.innerHTML = `
        <h4>${escapeHtml(b.title)}</h4>
        <p>${escapeHtml(b.author || "Unknown")}</p>
        <p>Status: <strong>${escapeHtml(b.status || '')}</strong></p>
        <p>Added: ${b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—'}</p>
      `;

      const editBtn = document.createElement("button");
      editBtn.className = "btn edit-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => startEditBook(b));

      const delBtn = document.createElement("button");
      delBtn.className = "btn delete-btn";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteBook(b._id || b.id));

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
  editingBookId = book._id || book.id;
  const titleEl = document.getElementById("bookTitle");
  const authorEl = document.getElementById("bookAuthor");
  const statusEl = document.getElementById("bookStatus");
  const conditionEl = document.getElementById("bookCondition");

  if (titleEl) titleEl.value = book.title || "";
  if (authorEl) authorEl.value = book.author || "";
  if (statusEl) statusEl.value = book.status || "To Read";
  if (conditionEl) conditionEl.value = book.condition || "";

  const btn = document.querySelector("#bookForm button");
  if (btn) btn.textContent = "Update Book";
}

async function deleteBook(id) {
  if (!confirm("Delete this book?")) return;
  try {
    const res = await authFetch(`${API_BASE_URL}/books/${id}`, { method: "DELETE" });
    if (!res) {
      alert("Error: no response from server");
      return;
    }

    const parsed = await safeParseJson(res);
    if (!res.ok || (parsed && parsed.success === false)) {
      const msg = (parsed && (parsed.message || parsed.__raw)) || `Error (${res.status})`;
      alert("Error: " + msg);
      return;
    }

    toast((parsed && (parsed.message || 'Deleted')) || 'Deleted');
    await loadBooks();
  } catch (err) {
    console.error(err);
    alert("Failed to delete book");
  }
}

// ------------------------------
// realtime: listen for inventory updates (uses shared socket if present)

function setupBookshelfSocket() {
  try {
    // prefer shared socket
    let s = window.__rc_socket;
    if (!s) {
      // attempt to create a minimal socket if socket.io global is available
      if (typeof io === 'function') {
        const token = (localStorage.getItem('token') || sessionStorage.getItem('token') || '').replace(/^Bearer\s+/i, '');
        if (token) {
          s = io((window.BASE_URL || "https://readcircle.onrender.com").replace(/\/api\/?$/, ''), { auth: { token: `Bearer ${token}` }, transports: ['websocket', 'polling'] });
          window.__rc_socket = s;
        }
      }
    }

    if (!s) return;
    // listen for inventory updates and refresh list if it affects current user
    s.on('inventory-updated', (payload) => {
      try {
        // payload: { type: 'book-added'|'book-deleted', userId, book, bookId }
        const currentUserId = (typeof authGetUser === 'function' ? (authGetUser()?._id || authGetUser()?.id) : null) || (function() {
          try {
            const tk = (localStorage.getItem('token') || '').replace(/^Bearer\s+/i, '');
            if (!tk) return null;
            const p = JSON.parse(atob(tk.split('.')[1])); return p.id || p._id || null;
          } catch (e) { return null; }
        })();

        if (!payload) return;
        if (payload.userId && currentUserId && String(payload.userId) === String(currentUserId)) {
          // refresh books
          loadBooks();
        } else {
          // for safety, if global listing changed you might still want to refresh
          // loadBooks();
        }
      } catch (e) { console.error('bookshelf socket handler error', e); }
    });
  } catch (e) {
    console.warn('setupBookshelfSocket error', e);
  }
}

// bootstrap
(async function initBookshelf() {
  try {
    await loadBooks();
    setupBookshelfSocket();
  } catch (e) {
    console.error('initBookshelf error', e);
  }
})();

// js_files/lending.js
const API_BASE = "https://readcircle.onrender.com/api";
requireAuth(); // redirect if not logged in

// helper: quick ObjectId guess (24 hex chars)
function looksLikeObjectId(s) {
  return typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
}
// ------- user search helper & UI (Debounced) -------

// DOM refs
const borrowerSearch = document.getElementById("borrowerSearch");
const borrowerSuggestions = document.getElementById("borrowerSuggestions");
const borrowerIdInput = document.getElementById("borrowerId");

// debounce helper
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// render suggestion list
function renderSuggestions(users) {
  if (!users || !users.length) {
    borrowerSuggestions.style.display = "none";
    borrowerSuggestions.innerHTML = "";
    return;
  }

  borrowerSuggestions.innerHTML = "";
  users.forEach(u => {
    const item = document.createElement("div");
    item.style.padding = "8px";
    item.style.borderBottom = "1px solid #f2f2f2";
    item.style.cursor = "pointer";
    item.innerHTML = `<strong>${escapeHtml(u.username)}</strong> <span style="color:#666;font-size:.9rem">(${escapeHtml(u.email || "")})</span>`;
    item.addEventListener("click", () => {
      // set selected borrower
      borrowerSearch.value = `${u.username} (${u.email || u._id})`;
      borrowerIdInput.value = u._id; // hidden input used in submit
      borrowerSuggestions.style.display = "none";
    });
    borrowerSuggestions.appendChild(item);
  });
  borrowerSuggestions.style.display = "block";
}

// query users API
async function queryUsers(term) {
  if (!term || term.length < 2) {
    renderSuggestions([]);
    return;
  }
  try {
    const res = await authFetch(`${API_BASE}/users?search=${encodeURIComponent(term)}`);
    if (!res.ok) return renderSuggestions([]);
    const users = await res.json();
    renderSuggestions(users);
  } catch (err) {
    console.error("queryUsers error:", err);
    renderSuggestions([]);
  }
}

const debouncedQuery = debounce((val) => queryUsers(val), 300);

// Wire search input
if (borrowerSearch) {
  borrowerSearch.addEventListener("input", (e) => {
    // clear hidden id if user types (so stale selection won't be used)
    borrowerIdInput.value = "";
    const val = e.target.value.trim();
    if (val.length === 0) {
      renderSuggestions([]);
      return;
    }
    debouncedQuery(val);
  });

  // hide suggestions on outside click
  document.addEventListener("click", (ev) => {
    if (!document.getElementById("borrowerSearch")?.contains(ev.target) && !document.getElementById("borrowerSuggestions")?.contains(ev.target)) {
      borrowerSuggestions.style.display = "none";
    }
  });

  // if user focuses, re-run suggestions for current text
  borrowerSearch.addEventListener("focus", (e) => {
    const v = e.target.value.trim();
    if (v.length >= 2) debouncedQuery(v);
  });
}

// Create lending
const createForm = document.getElementById("createLendForm");
createForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const bookTitle = document.getElementById("bookTitle").value.trim();
  const bookAuthor = document.getElementById("bookAuthor").value.trim();
  const dueDateVal = document.getElementById("dueDate").value || null;

  if (!bookTitle) { alert("Book title required"); return; }

  // Prefer selected user id from hidden input; fallback to raw search text
  const borrowerIdSelected = document.getElementById("borrowerId").value.trim() || null;
  const borrowerSearchRaw = (document.getElementById("borrowerSearch")?.value || "").trim() || null;

  // choose finalBorrowerValue:
  // - if user explicitly picked a suggestion -> use its _id (best)
  // - else if borrowerSearchRaw looks like a 24-hex id -> use raw text
  // - else let server attempt username/email lookup (if you enabled it), but warn user
  let borrowerIdToSend = null;
  if (borrowerIdSelected) {
    borrowerIdToSend = borrowerIdSelected;
  } else if (looksLikeObjectId(borrowerSearchRaw)) {
    borrowerIdToSend = borrowerSearchRaw;
  } else if (borrowerSearchRaw) {
    // not selected and not an ObjectId — ask user if they want to submit (server may try lookup)
    const ok = confirm("You didn't select a user from suggestions. If you typed a username or email, the server will try to resolve it. Submit anyway?");
    if (!ok) return;
    borrowerIdToSend = borrowerSearchRaw;
  } else {
    borrowerIdToSend = undefined;
  }

  try {
    const payload = {
      bookTitle,
      bookAuthor: bookAuthor || undefined,
      borrowerId: borrowerIdToSend || undefined,
      dueDate: dueDateVal || undefined
    };

    const res = await authFetch(`${API_BASE}/lending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      // try to parse JSON error body for clearer message
      let bodyText = await res.text();
      try { bodyText = JSON.parse(bodyText); } catch (e) { /* keep string */ }
      const msg = (bodyText && (bodyText.message || bodyText.error)) ? (bodyText.message || bodyText.error) : bodyText;
      alert("Failed to create lending: " + msg);
      return;
    }

    const data = await res.json();
    alert(data.message || "Lending created");
    createForm.reset();
    // clear hidden selection too
    if (document.getElementById("borrowerId")) document.getElementById("borrowerId").value = "";
    if (document.getElementById("borrowerSearch")) document.getElementById("borrowerSearch").value = "";

    loadMyLendings();
    loadBorrowed(); // refresh both panes
  } catch (err) {
    console.error("create lending error:", err);
    alert("Failed to create lending (see console)");
  }
});

// Load lendings where I'm lender
async function loadMyLendings() {
  const el = document.getElementById("myLendingsList");
  el.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lending`);
    if (!res.ok) {
      el.innerText = "Failed to load lendings";
      return;
    }
    const arr = await res.json();
    if (!arr.length) { el.innerHTML = "<p>No lendings created.</p>"; return; }

    el.innerHTML = "";
    arr.forEach(item => {
      const card = document.createElement("div");
      card.className = "lend-card";

      const left = document.createElement("div");
      left.className = "left";
      const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

      left.innerHTML = `
        <strong>${escapeHtml(item.bookTitle)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
        <div style="color:#666; font-size:.95rem; margin-top:.25rem;">
          Author: ${escapeHtml(item.bookAuthor || "Unknown")} • Status: <strong>${escapeHtml(item.status)}</strong>
          <div>Borrower: ${escapeHtml(item.borrowerName || (item.borrowerId ? item.borrowerId : "—"))}</div>
          <div>Due: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}</div>
        </div>
      `;

      const right = document.createElement("div");
      right.className = "right";

      if (item.status !== "returned") {
        const markBtn = document.createElement("button");
        markBtn.className = "btn";
        markBtn.textContent = "Mark Returned";
        markBtn.addEventListener("click", () => markReturned(item._id));
        right.appendChild(markBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-ghost";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteLending(item._id));
      right.appendChild(delBtn);

      card.appendChild(left);
      card.appendChild(right);
      el.appendChild(card);
    });
  } catch (err) {
    console.error("loadMyLendings error:", err);
    el.innerText = "Failed to load lendings";
  }
}

// Load items where I'm borrower
async function loadBorrowed() {
  const el = document.getElementById("borrowedList");
  el.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lending/borrowed`);
    if (!res.ok) {
      el.innerText = "Failed to load borrowed items";
      return;
    }
    const arr = await res.json();
    if (!arr.length) { el.innerHTML = "<p>No borrowed items.</p>"; return; }

    el.innerHTML = "";
    arr.forEach(item => {
      const card = document.createElement("div");
      card.className = "lend-card";
      const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

      const left = document.createElement("div");
      left.className = "left";
      left.innerHTML = `
        <strong>${escapeHtml(item.bookTitle)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
        <div style="color:#666; font-size:.95rem; margin-top:.25rem;">
          From: ${escapeHtml(item.lenderId?.username || (item.lenderId || "Lender"))}
          • Due: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}
          • Status: <strong>${escapeHtml(item.status)}</strong>
        </div>
      `;

      const right = document.createElement("div");
      right.className = "right";

      // If item is pending (status pending) borrower can confirm
      if (item.status === "pending") {
        const conf = document.createElement("button");
        conf.className = "btn";
        conf.textContent = "Confirm Borrow";
        conf.addEventListener("click", () => confirmBorrow(item._id));
        right.appendChild(conf);
      }

      card.appendChild(left);
      card.appendChild(right);
      el.appendChild(card);
    });
  } catch (err) {
    console.error("loadBorrowed error:", err);
    el.innerText = "Failed to load borrowed items";
  }
}

// Borrower confirms (if marketplace-style pending items exist)
async function confirmBorrow(id) {
  if (!confirm("Confirm you want to borrow this book?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lending/confirm/${id}`, { method: "POST" });
    if (!res.ok) {
      const text = await res.text();
      alert("Confirm failed: " + text);
      return;
    }
    const d = await res.json();
    alert(d.message || "Confirmed");
    loadMyLendings();
    loadBorrowed();
  } catch (err) {
    console.error("confirmBorrow error:", err);
    alert("Failed to confirm (see console)");
  }
}

// Lender marks returned
async function markReturned(id) {
  if (!confirm("Mark this lending as returned?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lending/return/${id}`, { method: "POST" });
    if (!res.ok) {
      const text = await res.text();
      alert("Mark returned failed: " + text);
      return;
    }
    const d = await res.json();
    alert(d.message || "Marked returned");
    loadMyLendings();
    loadBorrowed();
  } catch (err) {
    console.error("markReturned error:", err);
    alert("Failed to mark returned (see console)");
  }
}

// Lender deletes
async function deleteLending(id) {
  if (!confirm("Delete this lending record?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lending/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      alert("Delete failed: " + text);
      return;
    }
    const d = await res.json();
    alert(d.message || "Deleted");
    loadMyLendings();
    loadBorrowed();
  } catch (err) {
    console.error("deleteLending error:", err);
    alert("Failed to delete (see console)");
  }
}

// tiny escape
function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

// bootstrap loads
loadMyLendings();
loadBorrowed();

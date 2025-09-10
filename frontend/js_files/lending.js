// js_files/lending.js
const API_BASE = "https://readcircle.onrender.com/api";
requireAuth(); // guard (auth.js must define this and authFetch)

// ---------- small helpers ----------
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
function looksLikeObjectId(s) {
  return typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
}
function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// ---------- user search UI (borrower selection) ----------
const borrowerSearch = document.getElementById("borrowerSearch");
const borrowerSuggestions = document.getElementById("borrowerSuggestions");
const borrowerIdInput = document.getElementById("borrowerId");

async function queryUsers(term) {
  if (!term || term.length < 2) return renderSuggestions([]);
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

function renderSuggestions(users) {
  if (!borrowerSuggestions) return;
  if (!users || !users.length) {
    borrowerSuggestions.style.display = "none";
    borrowerSuggestions.innerHTML = "";
    return;
  }
  borrowerSuggestions.innerHTML = "";
  users.forEach(u => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.innerHTML = `<strong>${escapeHtml(u.username)}</strong> <span class="muted">(${escapeHtml(u.email || u._id)})</span>`;
    item.addEventListener("click", () => {
      if (borrowerSearch) borrowerSearch.value = `${u.username} (${u.email || u._id})`;
      if (borrowerIdInput) borrowerIdInput.value = u._id;
      borrowerSuggestions.style.display = "none";
    });
    borrowerSuggestions.appendChild(item);
  });
  borrowerSuggestions.style.display = "block";
}

const debouncedQuery = debounce((v) => queryUsers(v), 300);

if (borrowerSearch && borrowerSuggestions && borrowerIdInput) {
  borrowerSearch.addEventListener("input", (e) => {
    borrowerIdInput.value = ""; // clear previously selected id
    const v = e.target.value.trim();
    if (!v) return renderSuggestions([]);
    debouncedQuery(v);
  });

  borrowerSearch.addEventListener("focus", (e) => {
    const v = e.target.value.trim();
    if (v && v.length >= 2) debouncedQuery(v);
  });

  document.addEventListener("click", (ev) => {
    if (!document.getElementById("borrowerSearch")?.contains(ev.target) &&
        !document.getElementById("borrowerSuggestions")?.contains(ev.target)) {
      borrowerSuggestions.style.display = "none";
    }
  });
}

// ---------- create lending ----------
const createForm = document.getElementById("createLendForm");
if (createForm) {
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bookTitle = (document.getElementById("bookTitle")?.value || "").trim();
    const bookAuthor = (document.getElementById("bookAuthor")?.value || "").trim();
    const dueDateVal = (document.getElementById("dueDate")?.value || "").trim() || null;

    if (!bookTitle) { alert("Book title required"); return; }

    const borrowerIdSelected = (document.getElementById("borrowerId")?.value || "").trim() || null;
    const borrowerSearchRaw = (document.getElementById("borrowerSearch")?.value || "").trim() || null;

    let borrowerIdToSend;
    if (borrowerIdSelected) {
      borrowerIdToSend = borrowerIdSelected;
    } else if (looksLikeObjectId(borrowerSearchRaw)) {
      borrowerIdToSend = borrowerSearchRaw;
    } else if (borrowerSearchRaw) {
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
        let bodyText = await res.text();
        try { bodyText = JSON.parse(bodyText); } catch (err) {}
        const msg = (bodyText && (bodyText.message || bodyText.error)) ? (bodyText.message || bodyText.error) : bodyText;
        alert("Failed to create lending: " + msg);
        return;
      }

      const data = await res.json();
      alert(data.message || "Lending created");
      createForm.reset();
      if (borrowerIdInput) borrowerIdInput.value = "";
      if (borrowerSearch) borrowerSearch.value = "";
      loadMyLendings();
      loadBorrowed();
    } catch (err) {
      console.error("create lending error:", err);
      alert("Failed to create lending (see console)");
    }
  });
}

// ---------- load & render lists ----------
async function loadMyLendings() {
  const el = document.getElementById("myLendingsList");
  if (!el) return;
  el.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lending`);
    if (!res.ok) { el.innerText = "Failed to load lendings"; return; }
    const arr = await res.json();
    if (!arr.length) { el.innerHTML = "<p>No lendings created.</p>"; return; }

    el.innerHTML = "";
    arr.forEach(item => {
      const card = document.createElement("div");
      card.className = "lend-card";

      const left = document.createElement("div");
      left.className = "left";
      const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

      const borrowerDisplay = item.borrowerId?.username
        ? `${escapeHtml(item.borrowerId.username)}${item.borrowerId?.email ? ` (${escapeHtml(item.borrowerId.email)})` : ""}`
        : (item.borrowerName || (item.borrowerId?._id || "—"));

      left.innerHTML = `
        <strong>${escapeHtml(item.bookTitle)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
        <div class="meta">
          Author: ${escapeHtml(item.bookAuthor || "Unknown")} • Status: <strong>${escapeHtml(item.status)}</strong>
          <div>Borrower: ${borrowerDisplay}</div>
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

async function loadBorrowed() {
  const el = document.getElementById("borrowedList");
  if (!el) return;
  el.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lending/borrowed`);
    if (!res.ok) { el.innerText = "Failed to load borrowed items"; return; }
    const arr = await res.json();
    if (!arr.length) { el.innerHTML = "<p>No borrowed items.</p>"; return; }

    el.innerHTML = "";
    arr.forEach(item => {
      const card = document.createElement("div");
      card.className = "lend-card";
      const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

      const lenderDisplay = item.lenderId?.username
        ? `${escapeHtml(item.lenderId.username)}${item.lenderId?.email ? ` (${escapeHtml(item.lenderId.email)})` : ""}`
        : (item.lenderId?._id || "Lender");

      const left = document.createElement("div");
      left.className = "left";
      left.innerHTML = `
        <strong>${escapeHtml(item.bookTitle)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
        <div class="meta">
          From: ${lenderDisplay}
          • Due: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}
          • Status: <strong>${escapeHtml(item.status)}</strong>
        </div>
      `;

      const right = document.createElement("div");
      right.className = "right";

      card.appendChild(left);
      card.appendChild(right);
      el.appendChild(card);
    });
  } catch (err) {
    console.error("loadBorrowed error:", err);
    el.innerText = "Failed to load borrowed items";
  }
}

// ---------- actions ----------
async function markReturned(id) {
  if (!confirm("Mark this lending as returned?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lending/return/${id}`, { method: "POST" });
    if (!res.ok) { const text = await res.text(); alert("Mark returned failed: " + text); return; }
    const d = await res.json();
    alert(d.message || "Marked returned");
    loadMyLendings(); loadBorrowed();
  } catch (err) {
    console.error("markReturned error:", err);
    alert("Failed to mark returned (see console)");
  }
}

async function deleteLending(id) {
  if (!confirm("Delete this lending record?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lending/${id}`, { method: "DELETE" });
    if (!res.ok) { const text = await res.text(); alert("Delete failed: " + text); return; }
    const d = await res.json();
    alert(d.message || "Deleted");
    loadMyLendings(); loadBorrowed();
  } catch (err) {
    console.error("deleteLending error:", err);
    alert("Failed to delete (see console)");
  }
}

// ---------- bootstrap ----------
loadMyLendings();
loadBorrowed();

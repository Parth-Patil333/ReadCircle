const API_BASE = "https://readcircle.onrender.com/api";
requireAuth(); // ensure token available

// Create lending
document.getElementById("createLendForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bookTitle = document.getElementById("bookTitle").value.trim();
  const bookAuthor = document.getElementById("bookAuthor").value.trim();
  const borrowerName = document.getElementById("borrowerName").value.trim();
  const borrowerContact = document.getElementById("borrowerContact").value.trim();
  const dueDate = document.getElementById("dueDate").value || null;

  if (!bookTitle) { alert("Book title required"); return; }

  try {
    const res = await authFetch(`${API_BASE}/lending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookTitle, bookAuthor, borrowerName, borrowerContact, dueDate })
    });
    const data = await res.json();
    alert(data.message || "Created");
    e.target.reset();
    loadMyLendings();
  } catch (err) {
    console.error(err);
    alert("Failed to create lending");
  }
});

// Load lendings where I'm lender
async function loadMyLendings() {
  try {
    const res = await authFetch(`${API_BASE}/lending`);
    const arr = await res.json();
    const el = document.getElementById("myLendingsList");
    el.innerHTML = "";
    if (!arr.length) { el.innerHTML = "<p>No lendings created.</p>"; return; }

    arr.forEach(item => {
      const card = document.createElement("div");
      card.className = "lend-card";
      const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned") ? "OVERDUE" : "";

      card.innerHTML = `
        <h4>${escapeHtml(item.bookTitle)} ${overdue ? '<span class="tag overdue">OVERDUE</span>' : ''}</h4>
        <p>Author: ${escapeHtml(item.bookAuthor || "Unknown")}</p>
        <p>Status: <strong>${item.status}</strong></p>
        <p>Borrower: ${escapeHtml(item.borrowerName || "—")} ${item.borrowerContact ? `(${escapeHtml(item.borrowerContact)})` : ''}</p>
        <p>Due: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}</p>
      `;

      // actions: if pending and not confirmed show "Confirm by borrower" link? lenders can delete or mark returned
      const btns = document.createElement("div");
      btns.className = "actions";

      // mark returned (only if not returned)
      if (item.status !== "returned") {
        const rtn = document.createElement("button");
        rtn.className = "btn";
        rtn.textContent = "Mark Returned";
        rtn.addEventListener("click", () => markReturned(item._id));
        btns.appendChild(rtn);
      }

      // delete (only lender can delete — this is myLendings so allowed)
      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteLending(item._id));
      btns.appendChild(del);

      card.appendChild(btns);
      el.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    document.getElementById("myLendingsList").innerText = "Failed to load lendings";
  }
}

// Load items where I'm borrower
async function loadBorrowed() {
  try {
    const res = await authFetch(`${API_BASE}/lending/borrowed`);
    const arr = await res.json();
    const el = document.getElementById("borrowedList");
    el.innerHTML = "";
    if (!arr.length) { el.innerHTML = "<p>No borrowed items.</p>"; return; }

    arr.forEach(item => {
      const card = document.createElement("div");
      card.className = "lend-card";
      const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned") ? "OVERDUE" : "";

      card.innerHTML = `
        <h4>${escapeHtml(item.bookTitle)} ${overdue ? '<span class="tag overdue">OVERDUE</span>' : ''}</h4>
        <p>From: (Lender) ${escapeHtml(item.lenderId ? item.lenderId.username || "Lender" : "Lender")}</p>
        <p>Due: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}</p>
        <p>Status: <strong>${item.status}</strong></p>
      `;

      const btns = document.createElement("div");
      btns.className = "actions";

      // If item is pending (someone created without borrower), borrower can confirm here
      if (item.status === "pending") {
        const conf = document.createElement("button");
        conf.className = "btn";
        conf.textContent = "Confirm Borrow";
        conf.addEventListener("click", () => confirmBorrow(item._id));
        btns.appendChild(conf);
      }

      card.appendChild(btns);
      el.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    document.getElementById("borrowedList").innerText = "Failed to load borrowed items";
  }
}

// Borrower confirms
async function confirmBorrow(id) {
  if (!confirm("Confirm you want to borrow this book?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lending/confirm/${id}`, { method: "POST" });
    const d = await res.json();
    alert(d.message || "Confirmed");
    loadMyLendings();
    loadBorrowed();
  } catch (err) {
    console.error(err);
    alert("Failed to confirm");
  }
}

// Lender marks returned
async function markReturned(id) {
  if (!confirm("Mark this lending as returned?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lending/return/${id}`, { method: "POST" });
    const d = await res.json();
    alert(d.message || "Marked returned");
    loadMyLendings();
    loadBorrowed();
  } catch (err) {
    console.error(err);
    alert("Failed to mark returned");
  }
}

// Lender deletes
async function deleteLending(id) {
  if (!confirm("Delete this lending record?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lending/${id}`, { method: "DELETE" });
    const d = await res.json();
    alert(d.message || "Deleted");
    loadMyLendings();
    loadBorrowed();
  } catch (err) {
    console.error(err);
    alert("Failed to delete");
  }
}

// tiny escape
function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// bootstrap
loadMyLendings();
loadBorrowed();

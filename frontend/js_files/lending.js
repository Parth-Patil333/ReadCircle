// js_files/lending.js
const API_BASE = "https://readcircle.onrender.com/api";
requireAuth(); // redirect if not logged in

// Create lending
const createForm = document.getElementById("createLendForm");
createForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const bookTitle = document.getElementById("bookTitle").value.trim();
  const bookAuthor = document.getElementById("bookAuthor").value.trim();
  const borrowerId = document.getElementById("borrowerId").value.trim() || null;
  const dueDateVal = document.getElementById("dueDate").value || null;

  if (!bookTitle) { alert("Book title required"); return; }

  try {
    const payload = {
      bookTitle,
      bookAuthor: bookAuthor || undefined,
      borrowerId: borrowerId || undefined,
      dueDate: dueDateVal || undefined
    };

    const res = await authFetch(`${API_BASE}/lending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      alert("Failed to create lending: " + text);
      return;
    }

    const data = await res.json();
    alert(data.message || "Lending created");
    createForm.reset();
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
function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// bootstrap loads
loadMyLendings();
loadBorrowed();

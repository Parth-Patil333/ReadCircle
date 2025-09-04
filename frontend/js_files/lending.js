// lending.js (protected page)
const API_BASE_URL = "https://readcircle.onrender.com/api";

// ✅ gate the page + get a valid token
const token = requireAuth();

// --- Add Lending ---
document.getElementById('lendingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bookTitle = document.getElementById('bookTitle').value;
  const borrowerName = document.getElementById('borrowerName').value;
  const borrowerContact = document.getElementById('borrowerContact').value;
  const dueDate = document.getElementById('dueDate').value;

  try {
    const res = await authFetch(`${API_BASE_URL}/lending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookTitle, borrowerName, borrowerContact, dueDate })
    });
    const data = await res.json();
    alert(data.message || "Lending added");
    loadLendings();
  } catch (err) {
    console.error(err);
    alert("Failed to add lending");
  }
});

// --- Load Lending Records ---
async function loadLendings() {
  try {
    const res = await authFetch(`${API_BASE_URL}/lending`, { method: 'GET' });
    const lendings = await res.json();
    const list = document.getElementById('lendingList');
    list.innerHTML = '';
    lendings.forEach(lending => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${lending.bookTitle}</strong> → ${lending.borrowerName} 
        (Due: ${new Date(lending.dueDate).toLocaleDateString()}, Status: ${lending.status})
        <button onclick="markReturned('${lending._id}')">✔ Return</button>
        <button onclick="deleteLending('${lending._id}')">❌ Delete</button>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load lending records");
  }
}

// --- Mark as Returned ---
async function markReturned(id) {
  try {
    const res = await authFetch(`${API_BASE_URL}/lending/${id}/return`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    alert(data.message || "Marked as returned");
    loadLendings();
  } catch (err) {
    console.error(err);
    alert("Failed to mark returned");
  }
}

// --- Delete Lending ---
async function deleteLending(id) {
  if (!confirm("Are you sure you want to delete this entry?")) return;
  try {
    const res = await authFetch(`${API_BASE_URL}/lending/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    alert(data.message || "Lending deleted");
    loadLendings();
  } catch (err) {
    console.error(err);
    alert("Failed to delete lending");
  }
}

// --- Load Overdue ---
async function loadOverdue() {
  try {
    const res = await authFetch(`${API_BASE_URL}/lending/overdue`, { method: 'GET' });
    const overdue = await res.json();
    const list = document.getElementById('overdueList');
    list.innerHTML = '';
    overdue.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.bookTitle} → ${item.borrowerName} (Due: ${new Date(item.dueDate).toLocaleDateString()})`;
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load overdue");
  }
}

// --- Load Due Soon ---
async function loadDueSoon() {
  try {
    const res = await authFetch(`${API_BASE_URL}/lending/due-soon`, { method: 'GET' });
    const dueSoon = await res.json();
    const list = document.getElementById('dueSoonList');
    list.innerHTML = '';
    dueSoon.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.bookTitle} → ${item.borrowerName} (Due: ${new Date(item.dueDate).toLocaleDateString()})`;
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load due soon");
  }
}

// Initial loads (if you have these sections on the page)
loadLendings();
if (document.getElementById('overdueList')) loadOverdue();
if (document.getElementById('dueSoonList')) loadDueSoon();

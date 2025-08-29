const API_BASE_URL = "https://readcircle.onrender.com";

    // --- Add Lending ---
    document.getElementById('lendingForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const bookTitle = document.getElementById('bookTitle').value;
      const borrowerName = document.getElementById('borrowerName').value;
      const borrowerContact = document.getElementById('borrowerContact').value;
      const dueDate = document.getElementById('dueDate').value;

      const res = await fetch(`${API_BASE_URL}/api/lending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookTitle, borrowerName, borrowerContact, dueDate })
      });
      const data = await res.json();
      alert(data.message);
      loadLendings();
    });

    // --- Load Lending Records ---
    async function loadLendings() {
      const res = await fetch(`${API_BASE_URL}/api/lending`);
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
    }

    // --- Mark as Returned ---
    async function markReturned(id) {
      const res = await fetch(`${API_BASE_URL}/api/lending/${id}/return`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      alert(data.message);
      loadLendings();
    }

    // --- Delete Lending ---
    async function deleteLending(id) {
      const res = await fetch(`${API_BASE_URL}/api/lending/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      alert(data.message);
      loadLendings();
    }

    // --- Load Overdue ---
    async function loadOverdue() {
      const res = await fetch(`${API_BASE_URL}/api/lending/overdue`);
      const overdue = await res.json();
      const list = document.getElementById('overdueList');
      list.innerHTML = '';
      overdue.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.bookTitle} → ${item.borrowerName} (Due: ${new Date(item.dueDate).toLocaleDateString()})`;
        list.appendChild(li);
      });
    }

    // --- Load Due Soon ---
    async function loadDueSoon() {
      const res = await fetch(`${API_BASE_URL}/api/lending/due-soon`);
      const dueSoon = await res.json();
      const list = document.getElementById('dueSoonList');
      list.innerHTML = '';
      dueSoon.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.bookTitle} → ${item.borrowerName} (Due: ${new Date(item.dueDate).toLocaleDateString()})`;
        list.appendChild(li);
      });
    }
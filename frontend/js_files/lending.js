
const API_BASE_URL = "https://readcircle.onrender.com";

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
});

async function loadLendings() {
    const res = await fetch(`${API_BASE_URL}/api/lending`);
    const lendings = await res.json();
    const list = document.getElementById('lendingList');
    list.innerHTML = '';
    lendings.forEach(lending => {
        const li = document.createElement('li');
        li.textContent = `${lending.bookTitle} → ${lending.borrowerName} (Due: ${new Date(lending.dueDate).toLocaleDateString()}, Status: ${lending.status})`;
        list.appendChild(li);
    });
}
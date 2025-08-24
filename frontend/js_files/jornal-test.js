const API_BASE_URL = "https://readcircle.onrender.com";

document.getElementById('journalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value;
    const content = document.getElementById('content').value;
    const tags = document.getElementById('tags').value.split(',').map(t => t.trim());

    const res = await fetch(`${API_BASE_URL}/api/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, tags })
    });
    const data = await res.json();
    alert(data.message);
});

async function loadEntries() {
    const res = await fetch(`${API_BASE_URL}/api/journal`);
    const entries = await res.json();
    const list = document.getElementById('entriesList');
    list.innerHTML = '';
    entries.forEach(entry => {
        const li = document.createElement('li');
        li.textContent = `${entry.title} - ${entry.tags.join(', ')} (${new Date(entry.date).toLocaleDateString()})`;
        list.appendChild(li);
    });
}
const API_BASE_URL = "https://readcircle.onrender.com";

// Add new entry
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
    loadEntries();
});

// Load all entries
async function loadEntries() {
    const res = await fetch(`${API_BASE_URL}/api/journal`);
    const entries = await res.json();
    const list = document.getElementById('entriesList');
    list.innerHTML = '';
    entries.forEach(entry => {
        const li = document.createElement('li');
        li.innerHTML = `
          <b>${entry.title}</b> - ${entry.tags.join(', ')} 
          (${new Date(entry.date).toLocaleDateString()})<br>
          ${entry.content}<br>
          <button onclick="deleteEntry('${entry._id}')">Delete</button>
          <button onclick="showUpdateForm('${entry._id}', '${entry.title}', '${entry.content}', '${entry.tags.join(', ')}')">Update</button>
          <hr>
        `;
        list.appendChild(li);
    });
}

// Delete entry
async function deleteEntry(id) {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    const res = await fetch(`${API_BASE_URL}/api/journal/${id}`, {
        method: 'DELETE'
    });
    const data = await res.json();
    alert(data.message);
    loadEntries();
}

// Show update form (inline)
function showUpdateForm(id, title, content, tags) {
    const formHtml = `
        <h3>Update Entry</h3>
        <form id="updateForm">
          <input type="text" id="updateTitle" value="${title}" required><br>
          <textarea id="updateContent" required>${content}</textarea><br>
          <input type="text" id="updateTags" value="${tags}"><br>
          <button type="submit">Update</button>
        </form>
      `;
    document.getElementById('entriesList').insertAdjacentHTML('beforebegin', formHtml);

    document.getElementById('updateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newTitle = document.getElementById('updateTitle').value;
        const newContent = document.getElementById('updateContent').value;
        const newTags = document.getElementById('updateTags').value.split(',').map(t => t.trim());

        const res = await fetch(`${API_BASE_URL}/api/journal/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle, content: newContent, tags: newTags })
        });
        const data = await res.json();
        alert(data.message);
        loadEntries();
        document.getElementById('updateForm').remove(); // remove form after update
    });
}
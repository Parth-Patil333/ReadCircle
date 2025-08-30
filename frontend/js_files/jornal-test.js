const API_BASE_URL = "https://readcircle.onrender.com"; // replace with your Render backend URL after deploy

// Load all entries
async function loadEntries() {
    const res = await fetch(`${API_BASE_URL}/api/journal`);
    const data = await res.json();
    const container = document.getElementById("journalEntries");
    container.innerHTML = "";

    data.forEach(entry => {
        const div = document.createElement("div");
        div.innerHTML = `
          <h4>${entry.title}</h4>
          <p>${entry.content}</p>
          <p><small>Tags: ${entry.tags ? entry.tags.join(", ") : "None"}</small></p>
          <button onclick="updateEntry('${entry._id}')">Update</button>
          <button onclick="deleteEntry('${entry._id}')">Delete</button>
          <hr>
        `;
        container.appendChild(div);
    });
}

// Add entry
document.getElementById("addJournalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("title").value;
    const content = document.getElementById("content").value;
    const tags = document.getElementById("tags").value.split(",").map(t => t.trim()).filter(t => t);

    const res = await fetch(`${API_BASE_URL}/api/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, tags })
    });

    const data = await res.json();
    alert(data.message || "Entry added");
    loadEntries();
});

// Update entry
async function updateEntry(id) {
    const newTitle = prompt("Enter new title:");
    const newContent = prompt("Enter new content:");
    const newTags = prompt("Enter new tags (comma separated):");

    const res = await fetch(`${API_BASE_URL}/api/journal/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: newTitle,
            content: newContent,
            tags: newTags.split(",").map(t => t.trim()).filter(t => t)
        })
    });

    const data = await res.json();
    alert(data.message || "Entry updated");
    loadEntries();
}

// Delete entry
async function deleteEntry(id) {
    const res = await fetch(`${API_BASE_URL}/api/journal/${id}`, {
        method: "DELETE"
    });

    const data = await res.json();
    alert(data.message || "Entry deleted");
    loadEntries();
}

// Load entries on page load
loadEntries();
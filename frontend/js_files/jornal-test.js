const BASE_URL = "https://readcircle.onrender.com/api";

// ✅ Ensure user is logged in
requireAuth();

let editingId = null; // Track if we're editing an entry

// Handle form submit (add or update)
document.getElementById("journalForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;
  const tags = document.getElementById("tags").value.split(",").map(t => t.trim()).filter(Boolean);

  try {
    let res;
    if (editingId) {
      // Update existing entry
      res = await authFetch(`${BASE_URL}/journal/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, tags })
      });
    } else {
      // Add new entry
      res = await authFetch(`${BASE_URL}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, tags })
      });
    }

    if (!res.ok) {
      const text = await res.text();
      alert("Error: " + text);
      return;
    }

    const data = await res.json();
    alert(data.message || (editingId ? "Entry updated" : "Entry added"));

    // Reset form
    document.getElementById("journalForm").reset();
    editingId = null;
    document.querySelector("#journalForm button").textContent = "Add Entry";

    loadJournals();
  } catch (err) {
    console.error(err);
    alert("Failed to save entry");
  }
});

// Load all journal entries
async function loadJournals() {
  try {
    const res = await authFetch(`${BASE_URL}/journal`);
    const data = await res.json();

    const list = document.getElementById("journalList");
    list.innerHTML = "";

    data.forEach(entry => {
      const div = document.createElement("div");
      div.className = "entry-card";

      const title = document.createElement("h4");
      title.textContent = entry.title;

      const content = document.createElement("p");
      content.textContent = entry.content;

      const tags = document.createElement("small");
      tags.textContent = "Tags: " + (entry.tags?.join(", ") || "None");

      const editBtn = document.createElement("button");
      editBtn.className = "btn edit-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => startEdit(entry));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn delete-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => deleteEntry(entry._id));

      div.appendChild(title);
      div.appendChild(content);
      div.appendChild(tags);
      div.appendChild(document.createElement("br"));
      div.appendChild(editBtn);
      div.appendChild(deleteBtn);

      list.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load journals");
  }
}

// Start editing an entry
function startEdit(entry) {
  document.getElementById("title").value = entry.title;
  document.getElementById("content").value = entry.content;
  document.getElementById("tags").value = entry.tags?.join(", ") || "";

  editingId = entry._id;
  document.querySelector("#journalForm button").textContent = "Update Entry";
}

// Delete entry
async function deleteEntry(id) {
  if (!confirm("Are you sure you want to delete this entry?")) return;

  try {
    const res = await authFetch(`${BASE_URL}/journal/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      const text = await res.text();
      alert("Error: " + text);
      return;
    }

    const data = await res.json();
    alert(data.message || "Entry deleted");
    loadJournals();
  } catch (err) {
    console.error(err);
    alert("Failed to delete entry");
  }
}

// Load on page open
loadJournals();

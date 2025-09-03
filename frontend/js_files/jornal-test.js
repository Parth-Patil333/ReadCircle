const BASE_URL = "https://your-render-backend.onrender.com/api"; 
// 🔑 replace with your actual Render backend URL

// ✅ Ensure user is logged in
const token = localStorage.getItem("token");
if (!token) {
  alert("You must log in first!");
  window.location.href = "login.html";
}

// Add new journal entry
document.getElementById("journalForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;
  const tags = document.getElementById("tags").value.split(",").map(t => t.trim());

  try {
    const res = await fetch(`${BASE_URL}/journal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title, content, tags })
    });

    const data = await res.json();
    alert(data.message || "Entry added");

    document.getElementById("journalForm").reset();
    loadJournals();
  } catch (err) {
    console.error(err);
    alert("Failed to add journal entry");
  }
});

// Load all journal entries for logged-in user
async function loadJournals() {
  try {
    const res = await fetch(`${BASE_URL}/journal`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    const list = document.getElementById("journalList");
    list.innerHTML = "";

    data.forEach(entry => {
      const div = document.createElement("div");
      div.className = "entry-card";
      div.innerHTML = `
        <h4>${entry.title}</h4>
        <p>${entry.content}</p>
        <small>Tags: ${entry.tags?.join(", ") || "None"}</small><br>
        <button class="btn edit-btn" onclick="editEntry('${entry._id}', '${entry.title}', '${entry.content}', '${entry.tags?.join(",") || ""}')">Edit</button>
        <button class="btn delete-btn" onclick="deleteEntry('${entry._id}')">Delete</button>
      `;
      list.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load journals");
  }
}

// Edit entry (prefill form)
function editEntry(id, title, content, tags) {
  document.getElementById("title").value = title;
  document.getElementById("content").value = content;
  document.getElementById("tags").value = tags;

  // Change button to update mode
  const btn = document.querySelector("#journalForm button");
  btn.textContent = "Update Entry";
  btn.onclick = function (e) {
    e.preventDefault();
    updateEntry(id);
  };
}

// Update entry
async function updateEntry(id) {
  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;
  const tags = document.getElementById("tags").value.split(",").map(t => t.trim());

  try {
    const res = await fetch(`${BASE_URL}/journal/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title, content, tags })
    });

    const data = await res.json();
    alert(data.message || "Entry updated");

    document.getElementById("journalForm").reset();
    const btn = document.querySelector("#journalForm button");
    btn.textContent = "Add Entry";
    btn.onclick = null; // reset back to normal submit

    loadJournals();
  } catch (err) {
    console.error(err);
    alert("Failed to update entry");
  }
}

// Delete entry
async function deleteEntry(id) {
  if (!confirm("Are you sure you want to delete this entry?")) return;

  try {
    const res = await fetch(`${BASE_URL}/journal/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

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

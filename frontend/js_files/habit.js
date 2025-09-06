// habit.js (protected page)
const API_BASE_URL = "https://readcircle.onrender.com/api";

// token guard (auth.js must define requireAuth() and getToken())
const token = requireAuth(); // will redirect to login if no token

// small helper to always attach Authorization header
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  headers["Authorization"] = `Bearer ${token}`;
  options.headers = headers;
  return fetch(url, options);
}

// Load habits (plural) — matches this file's internal name
async function loadHabits() {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, {
      method: "GET"
    });

    // If API returns non-JSON on error, this may throw
    const data = await res.json();

    // Render a simple debug view in the page
    const out = document.getElementById("habitInfo");
    out.textContent = JSON.stringify(data, null, 2);

    console.log("My habits:", data);
  } catch (err) {
    console.error(err);
    alert("Failed to load habits");
  }
}

// Add a new habit (adjust the payload shape to your backend schema)
async function addHabit(name, goalType, goalValue) {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, goalType, goalValue })
    });
    const data = await res.json();
    alert(data.message || "Habit added");
    await loadHabits();
  } catch (err) {
    console.error(err);
    alert("Failed to add habit");
  }
}

// Update progress for today's habit (adjust endpoint & payload as needed)
async function updateProgress(progress) {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits/progress`, {
      method: "PUT",                     // <-- use PUT to match backend
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Update progress failed:", res.status, text);
      alert(`Update failed: ${res.status} ${res.statusText}`);
      return;
    }

    const data = await res.json();
    alert(data.message || "Progress updated");
    await loadHabits();
  } catch (err) {
    console.error("Network / parse error in updateProgress:", err);
    alert("Failed to update progress (see console)");
  }
}

/* ---------- DOM wiring ---------- */

// Habit set-goal form
const habitForm = document.getElementById("habitForm");
if (habitForm) {
  habitForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const goalType = document.getElementById("goalType").value;
    const goalValue = Number(document.getElementById("goalValue").value);
    // you might want a name for the habit — using goalType as name for demo
    const name = `${goalValue} ${goalType}`;
    addHabit(name, goalType, goalValue);
  });
}

// Progress update form
const progressForm = document.getElementById("progressForm");
if (progressForm) {
  progressForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const progress = Number(document.getElementById("progress").value);
    updateProgress(progress);
  });
}

// Load button
const loadBtn = document.getElementById("loadHabitBtn");
if (loadBtn) {
  loadBtn.addEventListener("click", (e) => {
    e.preventDefault();
    loadHabits();
  });
}

// Auto-load on page open
loadHabits();

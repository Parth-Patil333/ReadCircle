// habit.js (protected page)
const API_BASE_URL = "https://readcircle.onrender.com/api";

// ✅ token guard (comes from global auth.js)
requireAuth();

// Load habit (only one habit per user)
async function loadHabits() {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, { method: "GET" });
    const data = await res.json();

    const out = document.getElementById("habitInfo");

    if (data?.message === "No habit set" || data?.habit === null) {
      out.textContent = "No habit set yet. Use Set Goal above.";
      return;
    }

    // Show nicely formatted info
    out.textContent = JSON.stringify(data, null, 2);

    console.log("My habit:", data);
  } catch (err) {
    console.error(err);
    alert("Failed to load habits");
  }
}

// Set or update habit goal
async function setHabitRequest(goalType, goalValue) {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalType, goalValue })
    });

    const data = await res.json();
    alert(data.message || "Habit saved");
    await loadHabits();
  } catch (err) {
    console.error(err);
    alert("Failed to set habit");
  }
}

// Update daily progress
async function updateProgress(progress) {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits/progress`, {
      method: "PUT",
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
    if (!goalValue || goalValue <= 0) {
      alert("Goal value must be a positive number");
      return;
    }
    setHabitRequest(goalType, goalValue);
  });
}

// Progress update form
const progressForm = document.getElementById("progressForm");
if (progressForm) {
  progressForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const progress = Number(document.getElementById("progress").value);
    if (!progress || progress <= 0) {
      alert("Progress must be a positive number");
      return;
    }
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

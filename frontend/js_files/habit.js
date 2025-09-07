// habit.js (protected page)
const API_BASE_URL = "https://readcircle.onrender.com/api";

// ensure user is logged in (auth.js must be included before this file)
requireAuth();

let editing = false; // are we editing existing habit?

/**
 * Load habit for the logged-in user and render a friendly summary.
 * Accepts either the raw habit object or { message: 'No habit set' } from backend.
 */
async function loadHabits() {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, { method: "GET" });
    // If the server returned a non-JSON response, this will throw
    const data = await res.json();

    const out = document.getElementById("habitInfo");

    // If backend returns a "No habit set" message
    if (data?.message === "No habit set" || data?.habit === null) {
      out.innerHTML = `<p>No habit set yet. Use <strong>Set Goal</strong> above.</p>`;
      // reset edit mode if any
      clearEditMode();
      return;
    }

    // backend returns the habit object directly (or wrapped); normalize:
    const habit = data.habit ?? data;

    // Safety: ensure numeric fields
    const goalValue = Number(habit.goalValue || 0);
    const progress = Number(habit.progress || 0);
    const percent = goalValue > 0 ? Math.min((progress / goalValue) * 100, 100).toFixed(1) : 0;

    // Build summary DOM
    out.innerHTML = ""; // clear
    const container = document.createElement("div");
    container.className = "habit-summary";

    container.innerHTML = `
      <p><strong>Goal:</strong> ${escapeHtml(goalValue)} ${escapeHtml(habit.goalType)}</p>
      <p><strong>Progress today:</strong> ${escapeHtml(progress)} / ${escapeHtml(goalValue)} (${percent}%)</p>
      <div class="progress-bar"><div class="progress-fill" style="width:${percent}%;"></div></div>
      <p><strong>Streak:</strong> ${escapeHtml(habit.streak || 0)} day${(habit.streak || 0) !== 1 ? "s" : ""}</p>
      <p><strong>Last Updated:</strong> ${habit.lastUpdated ? new Date(habit.lastUpdated).toLocaleString() : "Never"}</p>
    `;

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "btn edit-btn";
    editBtn.textContent = "Edit Habit";
    editBtn.addEventListener("click", () => startEdit(habit));
    container.appendChild(editBtn);

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.className = "btn delete-btn";
    delBtn.style.marginLeft = "0.5rem";
    delBtn.textContent = "Delete Habit";
    delBtn.addEventListener("click", () => deleteHabit());
    container.appendChild(delBtn);

    out.appendChild(container);

    // ensure edit form state is consistent
    clearEditMode(false);
  } catch (err) {
    console.error("loadHabits error:", err);
    alert("Failed to load habits (see console)");
  }
}

/**
 * Create or update habit (backend setHabit handles both)
 */
async function setHabitRequest(goalType, goalValue) {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalType, goalValue })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("setHabitRequest failed:", res.status, text);
      alert(`Failed to set habit: ${res.status} ${res.statusText}`);
      return;
    }

    const data = await res.json();
    alert(data.message || "Habit saved");
    await loadHabits();
  } catch (err) {
    console.error("setHabitRequest error:", err);
    alert("Failed to set habit");
  }
}

/**
 * Update daily progress (PUT /habits/progress)
 */
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

/* ---------- Edit / Delete helpers ---------- */

function startEdit(habit) {
  // Prefill the goal form
  document.getElementById("goalType").value = habit.goalType || "pages";
  document.getElementById("goalValue").value = habit.goalValue || "";
  editing = true;

  // Change submit button text and show Cancel
  const submitBtn = document.querySelector("#habitForm button");
  submitBtn.textContent = "Update Habit";

  showCancelButton();
}

function clearEditMode(hideCancel = true) {
  editing = false;
  document.getElementById("habitForm").reset();
  const submitBtn = document.querySelector("#habitForm button");
  if (submitBtn) submitBtn.textContent = "Set Goal";

  if (hideCancel) {
    const cancel = document.getElementById("habitCancelBtn");
    if (cancel) cancel.remove();
  }
}

async function deleteHabit() {
  if (!confirm("Are you sure you want to delete your habit? This will remove goal/progress for your account.")) return;
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text();
      console.error("Delete habit failed:", res.status, t);
      alert("Failed to delete habit");
      return;
    }
    const d = await res.json();
    alert(d.message || "Habit deleted");
    clearEditMode();
    loadHabits();
  } catch (err) {
    console.error("deleteHabit error:", err);
    alert("Failed to delete habit (see console)");
  }
}

function showCancelButton() {
  // Add cancel button next to submit if not present
  if (document.getElementById("habitCancelBtn")) return;
  const btn = document.createElement("button");
  btn.id = "habitCancelBtn";
  btn.className = "btn btn-ghost";
  btn.type = "button";
  btn.style.marginLeft = "0.5rem";
  btn.textContent = "Cancel";
  btn.addEventListener("click", () => clearEditMode());
  const submitBtn = document.querySelector("#habitForm button");
  submitBtn.insertAdjacentElement("afterend", btn);
}

/* ---------- DOM wiring ---------- */

// Set / update goal form
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

// utility: escape text for safe insertion
function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Autoload on page open
loadHabits();

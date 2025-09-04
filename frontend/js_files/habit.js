// habit.js (protected page)
const API_BASE_URL = "https://readcircle.onrender.com/api";

// ✅ gate the page + get a valid token
const token = requireAuth(); // comes from global auth.js

// Example: load habits (adjust endpoint names if needed)
async function loadHabits() {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, {
      method: "GET"
    });
    const data = await res.json();

    // TODO: render your habits in the DOM
    console.log("My habits:", data);
  } catch (err) {
    console.error(err);
    alert("Failed to load habits");
  }
}

// Example: add a habit (adjust fields to your schema)
async function addHabit(name) {
  try {
    const res = await authFetch(`${API_BASE_URL}/habits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    alert(data.message || "Habit added");
    loadHabits();
  } catch (err) {
    console.error(err);
    alert("Failed to add habit");
  }
}

// Call on page load
loadHabits();

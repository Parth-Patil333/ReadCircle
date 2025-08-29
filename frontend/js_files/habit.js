const API_BASE_URL = "https://readcircle.onrender.com";

document.getElementById('habitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const goalType = document.getElementById('goalType').value;
    const goalValue = document.getElementById('goalValue').value;

    const res = await fetch(`${API_BASE_URL}/api/habits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalType, goalValue })
    });
    const data = await res.json();
    alert(data.message);
});

document.getElementById('progressForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const progress = document.getElementById('progress').value;

    const res = await fetch(`${API_BASE_URL}/api/habits/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress })
    });
    const data = await res.json();
    alert(data.message);
});

async function loadHabit() {
    const res = await fetch(`${API_BASE_URL}/api/habits`);
    const data = await res.json();
    document.getElementById('habitInfo').textContent = JSON.stringify(data, null, 2);
}
requireAuth(); // ensure user is logged in

const API = "https://readcircle.onrender.com/api";

// Fetch notifications from backend
async function fetchNotifications() {
  try {
    const res = await authFetch(`${API}/notifications`);
    if (!res.ok) {
      console.error("Failed to fetch notifications");
      return;
    }
    const arr = await res.json();
    renderNotifications(arr);
  } catch (err) {
    console.error("fetchNotifications error:", err);
  }
}

// Render notifications into the dropdown
function renderNotifications(arr) {
  const list = document.getElementById("notifItems");
  const count = document.getElementById("notifCount");
  if (!list || !count) return;

  const unread = arr.filter(n => !n.read).length;
  count.textContent = unread;

  if (!arr.length) {
    list.innerHTML = "<div>No notifications</div>";
    return;
  }

  list.innerHTML = arr.map(n => {
    const msg = n.data?.message || n.type;
    const date = new Date(n.createdAt).toLocaleString();
    return `
      <div class="notif-item ${n.read ? "read" : "unread"}" data-id="${n._id}">
        <div class="notif-msg">${escapeHtml(msg)}</div>
        <div class="notif-meta"><small>${date}</small></div>
        <button class="mark-read" data-id="${n._id}">Mark read</button>
      </div>
    `;
  }).join("");

  // Mark as read buttons
  list.querySelectorAll(".mark-read").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await authFetch(`${API}/notifications/read/${id}`, { method: "POST" });
      fetchNotifications();
    });
  });

  // Clicking notification can redirect (optional)
  list.querySelectorAll(".notif-item").forEach(div => {
    div.addEventListener("click", () => {
      const id = div.dataset.id;
      const notif = arr.find(x => x._id === id);
      if (notif?.data?.lendingId) {
        // redirect to lending page with query param
        window.location.href = `lending.html?view=${notif.data.lendingId}`;
      }
    });
  });
}

// Toggle dropdown open/close
document.getElementById("notifToggle").addEventListener("click", () => {
  const d = document.getElementById("notifList");
  d.style.display = (d.style.display === "none" || !d.style.display) ? "block" : "none";
});

// Escape helper
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
}

// Initial load and poll every 60 seconds
fetchNotifications();
setInterval(fetchNotifications, 60000);

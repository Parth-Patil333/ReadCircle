// js_files/dashboard.js
// Dashboard frontend (Netlify) — works with backend on Render
// Assumes you keep your token in localStorage under "token" like login.js

const BASE_URL = "https://readcircle.onrender.com/api";
const SOCKET_URL = "https://readcircle.onrender.com"; // Render host (no /api)

function requireAuth() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    throw new Error("Not authenticated");
  }
  return token;
}

// parse JWT payload helper
function parseJwt(token) {
  try {
    const base64 = token.split(".")[1];
    const jsonPayload = decodeURIComponent(atob(base64).split("").map(function(c) {
      return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(""));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// --- Auth / init ---
const token = requireAuth(); // redirect if missing
const payload = parseJwt(token) || {};
const nameText = payload.username || payload.name || "Reader";

// safe DOM refs (adjust IDs to your html)
if (document.getElementById("welcomeName")) document.getElementById("welcomeName").textContent = nameText;
if (document.getElementById("welcomeInline")) document.getElementById("welcomeInline").textContent = nameText;
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  window.location.href = "login.html";
});

// --- DOM refs for notifications ---
const notifBtn = document.getElementById("notifBtn");
const notifBadge = document.getElementById("notifBadge");
const notifDropdown = document.getElementById("notifDropdown");
const notifList = document.getElementById("notifList");
const markAllReadBtn = document.getElementById("markAllReadBtn");
const refreshNotifsBtn = document.getElementById("refreshNotifsBtn");

let notifications = [];
let notifOpen = false;

function authFetch(path, opts = {}) {
  opts.headers = opts.headers || {};
  opts.headers["Authorization"] = `Bearer ${token}`;
  opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
  opts.credentials = opts.credentials || "omit"; // cross-origin; don't include cookies by default
  return fetch(BASE_URL + path, opts);
}

function updateBadge() {
  const unread = notifications.filter(n => !n.read).length;
  if (notifBadge) {
    if (unread > 0) {
      notifBadge.hidden = false;
      notifBadge.textContent = String(unread);
    } else {
      notifBadge.hidden = true;
      notifBadge.textContent = "0";
    }
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

function renderNotifications() {
  if (!notifList) return;
  notifList.innerHTML = "";
  if (!notifications.length) {
    const li = document.createElement("li");
    li.className = "notif-empty";
    li.textContent = "No notifications";
    notifList.appendChild(li);
    updateBadge();
    return;
  }

  notifications.forEach(n => {
    const li = document.createElement("li");
    li.className = "notif-item";
    if (!n.read) li.classList.add("unread");

    const main = document.createElement("div");
    main.className = "notif-main";

    const text = document.createElement("div");
    text.className = "notif-text";
    text.textContent = n.message || "(no message)";

    const meta = document.createElement("div");
    meta.className = "notif-meta";
    meta.textContent = timeAgo(n.createdAt);

    main.appendChild(text);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "notif-actions";

    const markBtn = document.createElement("button");
    markBtn.className = "small";
    markBtn.textContent = n.read ? "Read" : "Mark read";
    markBtn.disabled = n.read;
    markBtn.addEventListener("click", async () => {
      await markAsRead(n._id || n.id);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "small";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      await deleteNotification(n._id || n.id);
    });

    actions.appendChild(markBtn);
    actions.appendChild(delBtn);

    li.appendChild(main);
    li.appendChild(actions);

    notifList.appendChild(li);
  });

  updateBadge();
}

// --- API calls ---
async function fetchNotifications() {
  try {
    const res = await authFetch(`/notifications?limit=25&page=1`);
    if (!res.ok) throw new Error("Failed to fetch notifications");
    const body = await res.json();
    // controller returns { items, total, page, limit }
    notifications = Array.isArray(body) ? body : (body.items || []);
    renderNotifications();
  } catch (err) {
    console.error("fetchNotifications:", err);
  }
}

async function fetchUnreadCount() {
  try {
    const res = await authFetch(`/notifications/unread-count`);
    if (!res.ok) return;
    const body = await res.json();
    const unread = body.unread ?? 0;
    if (notifBadge) {
      if (unread > 0) {
        notifBadge.hidden = false;
        notifBadge.textContent = String(unread);
      } else {
        notifBadge.hidden = true;
      }
    }
  } catch (err) {
    console.warn("fetchUnreadCount error:", err);
  }
}

async function markAsRead(notificationId) {
  try {
    const res = await authFetch(`/notifications/${notificationId}/read`, { method: "PATCH" });
    if (!res.ok) throw new Error("mark read failed");
    notifications = notifications.map(n => (n._id === notificationId || n.id === notificationId) ? { ...n, read: true } : n);
    renderNotifications();
  } catch (err) {
    console.error("markAsRead:", err);
  }
}

async function markAllRead() {
  try {
    const res = await authFetch(`/notifications/read-all`, { method: "PATCH" });
    if (!res.ok) throw new Error("mark all read failed");
    notifications = notifications.map(n => ({ ...n, read: true }));
    renderNotifications();
  } catch (err) {
    console.error("markAllRead:", err);
  }
}

async function deleteNotification(notificationId) {
  try {
    const res = await authFetch(`/notifications/${notificationId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("delete failed");
    notifications = notifications.filter(n => !(n._id === notificationId || n.id === notificationId));
    renderNotifications();
  } catch (err) {
    console.error("deleteNotification:", err);
  }
}

// --- UI events ---
if (notifBtn) {
  notifBtn.addEventListener("click", () => {
    notifOpen = !notifOpen;
    if (notifDropdown) notifDropdown.hidden = !notifOpen;
    notifBtn.setAttribute("aria-expanded", String(notifOpen));
    if (notifOpen) fetchNotifications();
  });
}
if (markAllReadBtn) markAllReadBtn.addEventListener("click", async () => { await markAllRead(); });
if (refreshNotifsBtn) refreshNotifsBtn.addEventListener("click", async () => { await fetchNotifications(); });

// initial fetches
fetchUnreadCount();
fetchNotifications();

// --- Socket.IO realtime connection (works across origins) ---
(function initSocket() {
  try {
    if (typeof io === "undefined") {
      console.warn("Socket.IO client not found. Realtime notifications disabled.");
      return;
    }

    // When connecting cross-origin to Render, pass the full URL and auth token
    const socket = io(SOCKET_URL, { auth: { token: `Bearer ${token}` }, transports: ['websocket', 'polling'] });

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });

    socket.on("notification", (payload) => {
      console.log("Realtime notification received:", payload);
      notifications.unshift({
        _id: payload.id || payload._id || String(Date.now()),
        message: payload.message,
        type: payload.type,
        data: payload.data,
        read: payload.read || false,
        createdAt: payload.createdAt || new Date().toISOString()
      });
      renderNotifications();
    });

    socket.on("connect_error", (err) => {
      console.warn("Socket connect_error:", err && err.message ? err.message : err);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });
  } catch (err) {
    console.error("initSocket error:", err);
  }
})();

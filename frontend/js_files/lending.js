const API_BASE = "https://readcircle.onrender.com/api";       // your backend API base
const SOCKET_URL = "https://readcircle.onrender.com";        // socket server origin
requireAuth(); // must be defined in auth.js and set up authFetch()

// ---- Robust endpoint helper: tries multiple candidate endpoints until one works ----
// Usage: await tryEndpoints(['lendings','lending'], '/pathSuffix', opts)
async function tryEndpoints(candidates, suffix = '', opts = {}) {
  // candidates: array of base paths to try (e.g. ['lendings','lending'])
  // suffix: optional path suffix beginning with '/' (e.g. '/borrowed' or '/:id/return')
  // opts: fetch options (method, headers, body)
  let lastErr = null;
  for (const base of candidates) {
    // build url and replace any '//' accidental double-slash
    const url = `${API_BASE}/${base}${suffix}`.replace(/([^:]\/)\/+/g, '$1');
    try {
      const res = await authFetch(url, opts);
      // if server returns 404 it means this candidate doesn't exist -> try next
      if (res.status === 404) {
        lastErr = res;
        continue;
      }
      // return the response (ok or other non-404 error)
      return res;
    } catch (err) {
      // network error: record and try next candidate
      lastErr = err;
      continue;
    }
  }
  // if none matched, throw the last error or a custom one
  throw lastErr || new Error('All endpoint candidates failed');
}

// Small wrappers for common resource calls to try plural and singular names
const ENDPOINT_BASE_CANDIDATES = ['lendings', 'lending']; // order: prefer plural

async function fetchLendings() {
  const res = await tryEndpoints(ENDPOINT_BASE_CANDIDATES, '', { method: 'GET' });
  return res;
}

async function fetchBorrowedEndpoint() {
  // many backends either provide /lendings/borrowed or don't (so we fall back to /lendings and filter)
  try {
    // try /lendings/borrowed or /lending/borrowed
    const res = await tryEndpoints(ENDPOINT_BASE_CANDIDATES, '/borrowed', { method: 'GET' });
    return { res, fallback: false };
  } catch (e) {
    // fallback: fetch all lendings and filter on client
    const resAll = await fetchLendings();
    return { res: resAll, fallback: true };
  }
}

async function createLendingRequest(payload) {
  return tryEndpoints(ENDPOINT_BASE_CANDIDATES, '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function markReturnedRequest(id) {
  // try PATCH /lendings/:id/return first, else try POST /lending/return/:id, else try /lending/:id/return
  const candidates = [
    { suffix: `/${id}/return`, method: 'PATCH' },   // PATCH /lendings/:id/return
    { suffix: `/return/${id}`, method: 'POST' },   // POST /lending/return/:id
    { suffix: `/${id}/return`, method: 'POST' }    // POST /lending/:id/return (fallback)
  ];
  let lastErr = null;
  for (const cand of candidates) {
    try {
      const res = await tryEndpoints(ENDPOINT_BASE_CANDIDATES, cand.suffix, { method: cand.method });
      if (res.status === 404) { lastErr = res; continue; }
      return res;
    } catch (e) { lastErr = e; continue; }
  }
  throw lastErr || new Error('markReturned: all attempts failed');
}

async function deleteLendingRequest(id) {
  return tryEndpoints(ENDPOINT_BASE_CANDIDATES, `/${id}`, { method: 'DELETE' });
}

async function fetchNotificationsRequest() {
  // some backends expose /lendings/notifications or a top-level /notifications route
  const notifCandidates = ['lendings/notifications', 'lending/notifications', 'notifications'];
  for (const cand of notifCandidates) {
    try {
      const url = `${API_BASE}/${cand}`.replace(/([^:]\/)\/+/g, '$1');
      const res = await authFetch(url, { method: 'GET' });
      if (res.status === 404) continue;
      return res;
    } catch (e) { continue; }
  }
  // nothing matched
  throw new Error('No notifications endpoint found');
}

async function markNotificationReadRequest(id) {
  const candList = [
    `/lendings/notifications/${id}/read`,
    `/lending/notifications/${id}/read`,
    `/notifications/${id}/read`
  ];
  for (const p of candList) {
    try {
      const url = `${API_BASE}${p}`.replace(/([^:]\/)\/+/g, '$1');
      const res = await authFetch(url, { method: 'PATCH' });
      if (res.status === 404) continue;
      return res;
    } catch (e) { continue; }
  }
  throw new Error('Mark-notification-read endpoint not found');
}

// ---------- token helper ----------
function getTokenForSocket() {
  // prefer authGetToken if your auth.js exposes it; otherwise fallback to localStorage
  try {
    if (typeof authGetToken === 'function') {
      const t = authGetToken();
      return t ? (t.startsWith('Bearer ') ? t : `Bearer ${t}`) : null;
    }
  } catch (e) {}
  return localStorage.getItem('token') || null; // may be "Bearer <token>" or raw
}

// ---------- small helpers ----------
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
function looksLikeObjectId(s) {
  return typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
}
function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function timeAgoOrLocal(dateStr) {
  try { return new Date(dateStr).toLocaleString(); } catch(e){ return dateStr; }
}

// ---------- DOM refs ----------
const borrowerSearch = document.getElementById("borrowerSearch");
const borrowerSuggestions = document.getElementById("borrowerSuggestions");
const borrowerIdInput = document.getElementById("borrowerId");
const createForm = document.getElementById("createLendForm");
const myLendingsEl = document.getElementById("myLendingsList");
const borrowedEl = document.getElementById("borrowedList");

// notification UI refs
const notifBtn = document.getElementById('notifBtn');
const notifDropdown = document.getElementById('notifDropdown');
const notifList = document.getElementById('notifList');
const notifCountElm = document.getElementById('notifCount');
const markAllReadBtn = document.getElementById('markAllReadBtn');

let notifications = [];
let socket = null;

// ---------- user search (borrower selection) ----------
async function queryUsers(term) {
  if (!term || term.length < 2) return renderSuggestions([]);
  try {
    const res = await authFetch(`${API_BASE}/users?search=${encodeURIComponent(term)}`);
    if (!res.ok) return renderSuggestions([]);
    const users = await res.json();
    renderSuggestions(users);
  } catch (err) {
    console.error("queryUsers error:", err);
    renderSuggestions([]);
  }
}

function renderSuggestions(users) {
  if (!borrowerSuggestions) return;
  borrowerSuggestions.innerHTML = "";
  if (!users || !users.length) {
    borrowerSuggestions.style.display = "none";
    return;
  }
  users.forEach(u => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.innerHTML = `<strong>${escapeHtml(u.username)}</strong> <span class="muted">(${escapeHtml(u.email || u._id)})</span>`;
    item.addEventListener("click", () => {
      borrowerSearch.value = `${u.username} (${u.email || u._id})`;
      borrowerIdInput.value = u._id;
      borrowerSuggestions.style.display = "none";
    });
    borrowerSuggestions.appendChild(item);
  });
  borrowerSuggestions.style.display = "block";
}

const debouncedQuery = debounce((v) => queryUsers(v), 300);

if (borrowerSearch && borrowerSuggestions && borrowerIdInput) {
  borrowerSearch.addEventListener("input", (e) => {
    borrowerIdInput.value = "";
    const v = e.target.value.trim();
    if (!v) return renderSuggestions([]);
    debouncedQuery(v);
  });
  borrowerSearch.addEventListener("focus", (e) => {
    const v = e.target.value.trim();
    if (v && v.length >= 2) debouncedQuery(v);
  });
  document.addEventListener("click", (ev) => {
    if (!document.getElementById("borrowerSearch")?.contains(ev.target) &&
        !document.getElementById("borrowerSuggestions")?.contains(ev.target)) {
      borrowerSuggestions.style.display = "none";
    }
  });
}

// ---------- create lending ----------
if (createForm) {
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bookTitle = (document.getElementById("bookTitle")?.value || "").trim();
    const bookAuthor = (document.getElementById("bookAuthor")?.value || "").trim();
    const dueDateVal = (document.getElementById("dueDate")?.value || "").trim() || null;

    if (!bookTitle) { alert("Book title required"); return; }

    const borrowerIdSelected = (document.getElementById("borrowerId")?.value || "").trim() || null;
    const borrowerSearchRaw = (document.getElementById("borrowerSearch")?.value || "").trim() || null;

    let borrowerIdToSend;
    if (borrowerIdSelected) {
      borrowerIdToSend = borrowerIdSelected;
    } else if (looksLikeObjectId(borrowerSearchRaw)) {
      borrowerIdToSend = borrowerSearchRaw;
    } else if (borrowerSearchRaw) {
      const ok = confirm("You didn't select a user from suggestions. If you typed a username or email, the server will try to resolve it. Submit anyway?");
      if (!ok) return;
      borrowerIdToSend = borrowerSearchRaw;
    } else {
      borrowerIdToSend = undefined;
    }

    try {
      const payload = {
        bookTitle,
        bookAuthor: bookAuthor || undefined,
        borrowerId: borrowerIdToSend || undefined,
        dueDate: dueDateVal || undefined
      };

      const res = await authFetch(`${API_BASE}/lendings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let bodyText = await res.text();
        try { bodyText = JSON.parse(bodyText); } catch (err) {}
        const msg = (bodyText && (bodyText.message || bodyText.error)) ? (bodyText.message || bodyText.error) : bodyText;
        alert("Failed to create lending: " + msg);
        return;
      }

      const data = await res.json();
      alert(data.message || "Lending created");
      createForm.reset();
      borrowerIdInput.value = "";
      borrowerSearch.value = "";
      await loadMyLendings();
      await loadBorrowed();
    } catch (err) {
      console.error("create lending error:", err);
      alert("Failed to create lending (see console)");
    }
  });
}

// ---------- load & render lists ----------
// ---------- load & render lists ----------
async function loadMyLendings() {
  if (!myLendingsEl) return;
  myLendingsEl.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lendings`);
    if (!res.ok) { myLendingsEl.innerText = "Failed to load lendings"; return; }
    const arr = await res.json();
    if (!arr.length) { myLendingsEl.innerHTML = "<p>No lendings created.</p>"; return; }

    myLendingsEl.innerHTML = "";
    arr.forEach(item => {
      const card = document.createElement("div");
      card.className = "lend-card";

      const left = document.createElement("div");
      left.className = "left";
      const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

      const borrowerDisplay = item.borrowerId?.username
        ? `${escapeHtml(item.borrowerId.username)}${item.borrowerId?.email ? ` (${escapeHtml(item.borrowerId.email)})` : ""}`
        : (item.borrowerName || (item.borrowerId?._id || "—"));

      left.innerHTML = `
        <strong>${escapeHtml(item.bookTitle)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
        <div class="meta">
          Author: ${escapeHtml(item.bookAuthor || "Unknown")} • Status: <strong>${escapeHtml(item.status)}</strong>
          <div>Borrower: ${borrowerDisplay}</div>
          <div>Due: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}</div>
        </div>
      `;

      const right = document.createElement("div");
      right.className = "right";

      if (item.status !== "returned") {
        const markBtn = document.createElement("button");
        markBtn.className = "btn";
        markBtn.textContent = "Mark Returned";
        markBtn.addEventListener("click", () => markReturned(item._id));
        right.appendChild(markBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-ghost";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteLending(item._id));
      right.appendChild(delBtn);

      card.appendChild(left);
      card.appendChild(right);
      myLendingsEl.appendChild(card);
    });
  } catch (err) {
    console.error("loadMyLendings error:", err);
    myLendingsEl.innerText = "Failed to load lendings";
  }
}

async function loadBorrowed() {
  if (!borrowedEl) return;
  borrowedEl.innerHTML = "Loading...";
  try {
    // try server-provided /lendings/borrowed first
    let res = await authFetch(`${API_BASE}/lendings/borrowed`);
    let arr;
    if (res.status === 404) {
      // fallback: fetch all lendings and filter client-side for current user as borrower
      res = await authFetch(`${API_BASE}/lendings`);
      if (!res.ok) { borrowedEl.innerText = "Failed to load borrowed items"; return; }
      arr = await res.json();

      // determine current user id (try authGetUser() helper if you have it)
      let currentUserId = null;
      try {
        if (typeof authGetUser === 'function') {
          const u = authGetUser();
          currentUserId = u?._id || u?.id || null;
        }
      } catch (e) { /* ignore */ }

      // fallback: decode JWT from localStorage if available
      if (!currentUserId) {
        try {
          const tokenRaw = (localStorage.getItem('token') || '').replace(/^Bearer\s+/i, '');
          if (tokenRaw) {
            const payload = JSON.parse(atob(tokenRaw.split('.')[1]));
            currentUserId = payload.id || payload._id || null;
          }
        } catch (e) { /* ignore */ }
      }

      if (currentUserId) {
        arr = arr.filter(l => {
          const bid = l.borrower?._id || l.borrowerId || l.borrower;
          return String(bid) === String(currentUserId);
        });
      } else {
        // if we couldn't determine user id, show none and log a note
        console.warn('Could not determine current user id for client-side borrowed filtering');
        arr = [];
      }
    } else {
      // success on /lendings/borrowed
      if (!res.ok) { borrowedEl.innerText = "Failed to load borrowed items"; return; }
      arr = await res.json();
    }

    if (!arr.length) { borrowedEl.innerHTML = "<p>No borrowed items.</p>"; return; }

    borrowedEl.innerHTML = "";
    arr.forEach(item => {
      const card = document.createElement("div");
      card.className = "lend-card";
      const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

      const lenderDisplay = item.lenderId?.username
        ? `${escapeHtml(item.lenderId.username)}${item.lenderId?.email ? ` (${escapeHtml(item.lenderId.email)})` : ""}`
        : (item.lenderId?._id || "Lender");

      const left = document.createElement("div");
      left.className = "left";
      left.innerHTML = `
        <strong>${escapeHtml(item.bookTitle)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
        <div class="meta">
          From: ${lenderDisplay}
          • Due: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}
          • Status: <strong>${escapeHtml(item.status)}</strong>
        </div>
      `;

      const right = document.createElement("div");
      right.className = "right";

      card.appendChild(left);
      card.appendChild(right);
      borrowedEl.appendChild(card);
    });
  } catch (err) {
    console.error("loadBorrowed error:", err);
    borrowedEl.innerText = "Failed to load borrowed items";
  }
}

// ---------- actions ----------
async function markReturned(id) {
  if (!confirm("Mark this lending as returned?")) return;
  try {
    // prefer PATCH /lendings/:id/return
    const res = await authFetch(`${API_BASE}/lendings/${id}/return`, { method: "PATCH" });
    if (!res.ok) {
      // try legacy POST /lendings/return/:id as fallback
      if (res.status === 404) {
        const res2 = await authFetch(`${API_BASE}/lendings/return/${id}`, { method: "POST" });
        if (!res2.ok) { const text = await res2.text(); alert("Mark returned failed: " + text); return; }
        const d2 = await res2.json();
        alert(d2.message || "Marked returned");
        await loadMyLendings(); await loadBorrowed();
        return;
      }
      const text = await res.text();
      alert("Mark returned failed: " + text);
      return;
    }
    const d = await res.json();
    alert(d.message || "Marked returned");
    await loadMyLendings(); await loadBorrowed();
  } catch (err) {
    console.error("markReturned error:", err);
    alert("Failed to mark returned (see console)");
  }
}

async function deleteLending(id) {
  if (!confirm("Delete this lending record?")) return;
  try {
    const res = await authFetch(`${API_BASE}/lendings/${id}`, { method: "DELETE" });
    if (!res.ok) { const text = await res.text(); alert("Delete failed: " + text); return; }
    const d = await res.json();
    alert(d.message || "Deleted");
    await loadMyLendings(); await loadBorrowed();
  } catch (err) {
    console.error("deleteLending error:", err);
    alert("Failed to delete (see console)");
  }
}

// ---------- notifications: UI + API + socket ----------
async function fetchNotifications() {
  try {
    // try /lendings/notifications then /notifications
    let res = await authFetch(`${API_BASE}/lendings/notifications`);
    if (res.status === 404) {
      res = await authFetch(`${API_BASE}/notifications`);
    }
    if (!res.ok) return;
    const data = await res.json();
    notifications = data.notifications || [];
    renderNotifications();
  } catch (err) {
    console.error('fetchNotifications error', err);
  }
}

function renderNotifications() {
  if (!notifList) return;
  if (!notifications.length) {
    notifList.innerHTML = '<div class="empty">No notifications</div>';
    notifCountElm.textContent = '';
    return;
  }
  const unread = notifications.filter(n => !n.read).length;
  notifCountElm.textContent = unread ? unread : '';
  notifList.innerHTML = notifications.map(n => {
    const cls = n.read ? 'notif read' : 'notif unread';
    const linkAttr = n.link ? `data-link="${escapeHtml(n.link)}"` : '';
    return `<div class="${cls}" data-id="${n._id}" ${linkAttr}>
      <div class="message">${escapeHtml(n.message)}</div>
      <div class="meta">${timeAgoOrLocal(n.createdAt)}</div>
    </div>`;
  }).join('');
}

// mark a notif as read server-side
async function markNotificationRead(id) {
  try {
    // try lendings route first, then top-level notifications route
    let url = `${API_BASE}/lendings/notifications/${id}/read`;
    let res = await authFetch(url, { method: 'PATCH' });
    if (res.status === 404) {
      url = `${API_BASE}/notifications/${id}/read`;
      res = await authFetch(url, { method: 'PATCH' });
    }
    if (!res.ok) return;
    const { notification } = await res.json();
    notifications = notifications.map(n => n._id === id ? { ...n, read: true } : n);
    renderNotifications();
  } catch (err) {
    console.error('markNotificationRead error', err);
  }
}

async function markAllRead() {
  const unread = notifications.filter(n => !n.read).map(n => n._id);
  for (const id of unread) {
    // sequential to avoid rate issues; can switch to Promise.all if desired
    // eslint-disable-next-line no-await-in-loop
    await markNotificationRead(id);
  }
}
// notif click handlers (delegation)
if (notifList) {
  notifList.addEventListener('click', (e) => {
    const item = e.target.closest('.notif');
    if (!item) return;
    const id = item.dataset.id;
    const link = item.dataset.link;
    markNotificationRead(id).then(() => {
      if (link) window.location.href = link;
    });
  });
}
if (notifBtn) {
  notifBtn.addEventListener('click', () => {
    notifDropdown.classList.toggle('hidden');
    if (!notifDropdown.classList.contains('hidden')) fetchNotifications();
  });
}
if (markAllReadBtn) markAllReadBtn.addEventListener('click', () => markAllRead());

// ---------- socket.io setup ----------
function setupSocket() {
  try {
    const token = getTokenForSocket();
    if (!token) {
      console.warn('No token for socket auth; socket will not connect.');
      return;
    }

    // connect to your server's socket endpoint
    socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('Socket connected', socket.id);
      // refresh notifications on connect
      fetchNotifications();
    });

    socket.on('notification', (notif) => {
      // insert at top
      notifications.unshift(notif);
      if (notifications.length > 200) notifications = notifications.slice(0, 200);
      renderNotifications();
      toast(notif.message);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connect error:', err && err.message ? err.message : err);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected', reason);
      // will fallback to polling via fetchNotifications on open of dropdown
    });

  } catch (err) {
    console.error('setupSocket error', err);
  }
}

// small toast
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'notif-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => t.classList.remove('visible'), 3000);
  setTimeout(() => t.remove(), 3500);
}

// ---------- bootstrap ----------
(async function init() {
  try {
    await loadMyLendings();
    await loadBorrowed();
    // initial notifications
    await fetchNotifications();
    // socket
    setupSocket();
  } catch (err) {
    console.error('init error', err);
  }
})();

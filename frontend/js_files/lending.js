// js_files/lending.js — PART 1 of 6
// ------------------------------
// 1) constants and auth guard
const API_BASE = "https://readcircle.onrender.com/api";
const SOCKET_URL = "https://readcircle.onrender.com";
requireAuth(); // must be defined in auth.js and set up authFetch()

// 2) helper to resolve current user id (tries authGetUser(), else decodes JWT)
function resolveCurrentUserId() {
  try {
    if (typeof authGetUser === 'function') {
      const u = authGetUser();
      return u?._id || u?.id || null;
    }
  } catch (e) { /* ignore */ }
  try {
    const tokenRaw = (localStorage.getItem('token') || '').replace(/^Bearer\s+/i, '');
    if (!tokenRaw) return null;
    const payload = JSON.parse(atob(tokenRaw.split('.')[1]));
    return payload.id || payload._id || null;
  } catch (e) {
    return null;
  }
}

// 3) OPTIONAL robust endpoint helpers (keep if you want fallbacks)
// You can remove these if you prefer direct endpoints. I keep them for resilience.
async function tryEndpoints(candidates, suffix = '', opts = {}) {
  let lastErr = null;
  for (const base of candidates) {
    const url = `${API_BASE}/${base}${suffix}`.replace(/([^:]\/)\/+/g, '$1');
    try {
      const res = await authFetch(url, opts);
      if (res.status === 404) { lastErr = res; continue; }
      return res;
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  throw lastErr || new Error('All endpoint candidates failed');
}
const ENDPOINT_BASE_CANDIDATES = ['lendings', 'lending']; // prefer plural first

async function fetchLendings() {
  return tryEndpoints(ENDPOINT_BASE_CANDIDATES, '', { method: 'GET' });
}

// 4) token helper for socket
function getTokenForSocket() {
  try {
    if (typeof authGetToken === 'function') {
      const t = authGetToken();
      return t ? (t.startsWith('Bearer ') ? t : `Bearer ${t}`) : null;
    }
  } catch (e) { /* ignore */ }
  return localStorage.getItem('token') || null;
}

// 5) small UI helpers
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function looksLikeObjectId(s) {
  return typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
}
function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function timeAgoOrLocal(dateStr) {
  try { return new Date(dateStr).toLocaleString(); } catch (e) { return dateStr; }
}

// 6) DOM refs
const borrowerSearch = document.getElementById("borrowerSearch");
const borrowerSuggestions = document.getElementById("borrowerSuggestions");
const borrowerIdInput = document.getElementById("borrowerId");
const createForm = document.getElementById("createLendForm");
const myLendingsEl = document.getElementById("myLendingsList");
const borrowedEl = document.getElementById("borrowedList");

// notification UI refs (will be used in later parts)
const notifBtn = document.getElementById('notifBtn');
const notifDropdown = document.getElementById('notifDropdown');
const notifList = document.getElementById('notifList');
const notifCountElm = document.getElementById('notifCount');
const markAllReadBtn = document.getElementById('markAllReadBtn');

// store runtime state
let notifications = [];
let socket = null;

// temp cache so new lendings don't vanish when list reloads
const tempCreatedLendings = new Map();

// 7) borrower search logic (user suggestion dropdown)
async function queryUsers(term) {
  if (!term || term.length < 2) return renderSuggestions([]);
  try {
    // prefer your /api/users?search= endpoint
    const res = await authFetch(`${API_BASE}/users?search=${encodeURIComponent(term)}`);
    if (!res.ok) return renderSuggestions([]);
    const users = await res.json();
    // some APIs return { users: [...] }
    const arr = Array.isArray(users) ? users : (Array.isArray(users.users) ? users.users : (Array.isArray(users.data) ? users.data : []));
    renderSuggestions(arr);
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
    item.innerHTML = `<strong>${escapeHtml(u.username || u.name || u._id)}</strong> <span class="muted">(${escapeHtml(u.email || u._id || '')})</span>`;
    item.addEventListener("click", () => {
      borrowerSearch.value = `${u.username || u.name} (${u.email || u._id})`;
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

// End of PART 1
// js_files/lending.js — PART 2 of 6
// ------------------------------
// CREATE LENDING: request wrapper + form submit handler

// createLendingRequest: prefer singular /api/lending, fallback to /api/lendings
async function createLendingRequest(payload) {
  // try singular (your backend mounts router at /api/lending)
  let res = await authFetch(`${API_BASE}/lending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.status === 404) {
    // fallback to plural if singular not found
    try {
      res = await authFetch(`${API_BASE}/lendings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // keep original res if fallback fails
    }
  }
  return res;
}

// Attach create form handler (uses createLendingRequest)
if (createForm) {
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const bookTitle = (document.getElementById('bookTitle')?.value || '').trim();
    const bookAuthor = (document.getElementById('bookAuthor')?.value || '').trim();
    const dueDateVal = (document.getElementById('dueDate')?.value || '').trim() || null;

    if (!bookTitle) {
      alert('Book title required');
      return;
    }

    const borrowerIdSelected = (document.getElementById('borrowerId')?.value || '').trim() || null;
    const borrowerSearchRaw = (document.getElementById('borrowerSearch')?.value || '').trim() || null;

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

    const payload = {
      bookTitle,
      bookAuthor: bookAuthor || undefined,
      borrowerId: borrowerIdToSend || undefined,
      dueDate: dueDateVal || undefined
    };

    try {
      const res = await createLendingRequest(payload);

      if (!res) {
        alert('Failed to create lending: no response from server');
        return;
      }

      // If server returns HTML error page it will not be JSON — handle gracefully
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        let bodyText;
        try { bodyText = await res.text(); } catch (e) { bodyText = String(e); }
        if (contentType.includes('application/json')) {
          try {
            const json = JSON.parse(bodyText);
            alert('Failed to create lending: ' + (json.message || JSON.stringify(json)));
          } catch (e) {
            alert('Failed to create lending');
          }
        } else {
          alert('Failed to create lending: ' + (bodyText ? bodyText.slice(0, 300) : `status ${res.status}`));
        }
        return;
      }

      // success — parse JSON if possible
      let data = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        try { data = JSON.parse(await res.text()); } catch (e) { data = {}; }
      }

      console.log('create lending response:', data);
      alert((data.message || (data.lending && data.lending.message)) || 'Lending created');

      // ----- CACHE THE NEW LENDING (so it doesn't vanish on list reload) -----
      if (data.lending && data.lending._id) {
        const lending = data.lending;
        const lid = String(lending._id);
        tempCreatedLendings.set(lid, lending);
        // auto-clear after 30s to avoid stale entries
        setTimeout(() => tempCreatedLendings.delete(lid), 30 * 1000);
      }

      // ----- IMMEDIATE UI UPDATE -----
      if (data.lending) {
        const lending = data.lending;
        const lenderId = lending?.lender?._id || lending?.lender || lending?.lenderId || lending?.lender?.id;
        const currentUserId = resolveCurrentUserId();

        if (String(lenderId) === String(currentUserId)) {
          // If current user is lender — show card immediately
          if (myLendingsEl) {
            const card = renderLendingCardForLender(lending);
            // attach data-id for dedupe/identification
            const id = lending._id || lending.id || '';
            if (id) card.dataset.id = String(id);
            myLendingsEl.insertBefore(card, myLendingsEl.firstChild);
          } else {
            // fallback: load my lendings
            await loadMyLendings();
          }
        } else {
          // not the lender — refresh borrowed list
          await loadBorrowed();
        }
      } else {
        // no lending in response; fallback to full refresh
        await loadMyLendings();
        await loadBorrowed();
      }

      // reset form fields
      createForm.reset();
      if (borrowerIdInput) borrowerIdInput.value = '';
      if (borrowerSearch) borrowerSearch.value = '';

      // gentle background refresh (lets server-side propagate) — merge prevents vanishing
      setTimeout(() => {
        loadMyLendings();
        loadBorrowed();
      }, 800);

    } catch (err) {
      console.error('create lending error:', err);
      alert('Failed to create lending (see console)');
    }
  });
}

// End of PART 2
// js_files/lending.js — PART 3 of 6
// ------------------------------
// LISTING + RENDERING: loadMyLendings() and loadBorrowed()

// Helper: normalize server response into an array of lendings
function normalizeLendingsResponse(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.lendings)) return payload.lendings;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  // try to find the first array value
  const firstArr = Object.values(payload).find(v => Array.isArray(v));
  if (Array.isArray(firstArr)) return firstArr;
  return [];
}

// Renders a single lending item card for lender list
function renderLendingCardForLender(item) {
  const card = document.createElement("div");
  card.className = "lend-card";

  const left = document.createElement("div");
  left.className = "left";
  const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

  const borrowerObj = item.borrower || item.borrowerId || null;
  const borrowerDisplay = borrowerObj?.username
    ? `${escapeHtml(borrowerObj.username)}${borrowerObj?.email ? ` (${escapeHtml(borrowerObj.email)})` : ""}`
    : (item.borrowerName || (borrowerObj?._id || borrowerObj || "—"));

  left.innerHTML = `
    <strong>${escapeHtml(item.bookTitle)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
    <div class="meta">
      Author: ${escapeHtml(item.bookAuthor || "Unknown")} • Status: <strong>${escapeHtml(item.status || 'lent')}</strong>
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
    markBtn.addEventListener("click", () => markReturned(item._id || item.id));
    right.appendChild(markBtn);
  }

  const delBtn = document.createElement("button");
  delBtn.className = "btn btn-ghost";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", () => deleteLending(item._id || item.id));
  right.appendChild(delBtn);

  card.appendChild(left);
  card.appendChild(right);
  return card;
}

// Renders a single lending item card for borrowed list
function renderBorrowedCard(item) {
  const card = document.createElement("div");
  card.className = "lend-card";

  const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

  const lenderObj = item.lender || item.lenderId || null;
  const lenderDisplay = lenderObj?.username
    ? `${escapeHtml(lenderObj.username)}${lenderObj?.email ? ` (${escapeHtml(lenderObj.email)})` : ""}`
    : (lenderObj?._id || "Lender");

  const left = document.createElement("div");
  left.className = "left";
  left.innerHTML = `
    <strong>${escapeHtml(item.bookTitle)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
    <div class="meta">
      From: ${lenderDisplay}
      • Due: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}
      • Status: <strong>${escapeHtml(item.status || 'lent')}</strong>
    </div>
  `;

  const right = document.createElement("div");
  right.className = "right";

  card.appendChild(left);
  card.appendChild(right);
  return card;
}

// loadMyLendings: fetch lendings and show those where current user is lender
async function loadMyLendings() {
  if (!myLendingsEl) return;
  myLendingsEl.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lending`);
    if (!res.ok) { myLendingsEl.innerText = "Failed to load lendings"; return; }
    const payload = await res.json();
    const all = normalizeLendingsResponse(payload);

    const currentUserId = resolveCurrentUserId();

    // ✅ FIX: always check lender._id first (because backend populates lender)
    const myLendings = currentUserId
      ? all.filter(l => {
          const lid = l.lender?._id || l.lenderId || l.lender;
          return String(lid) === String(currentUserId);
        })
      : [];

    // Merge any recently created lendings stored in tempCreatedLendings (avoid losing them)
    const mergedById = new Map();
    myLendings.forEach(l => {
      const id = String(l._id || l.id || '');
      if (id) mergedById.set(id, l);
    });
    for (const [id, cached] of tempCreatedLendings.entries()) {
      if (!mergedById.has(String(id))) {
        mergedById.set(String(id), cached);
      }
    }
    const merged = Array.from(mergedById.values());

    if (!merged.length) { myLendingsEl.innerHTML = "<p>No lendings created.</p>"; return; }

    myLendingsEl.innerHTML = "";
    merged.forEach(item => {
      const card = renderLendingCardForLender(item);
      const id = item._id || item.id || '';
      if (id) card.dataset.id = String(id);
      myLendingsEl.appendChild(card);
    });
  } catch (err) {
    console.error("loadMyLendings error:", err);
    myLendingsEl.innerText = "Failed to load lendings";
  }
}

// loadBorrowed: fetch lendings and show those where current user is borrower
async function loadBorrowed() {
  if (!borrowedEl) return;
  borrowedEl.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lending`);
    if (!res.ok) { borrowedEl.innerText = "Failed to load borrowed items"; return; }
    const payload = await res.json();
    const all = normalizeLendingsResponse(payload);

    const currentUserId = resolveCurrentUserId();

    const borrowed = currentUserId
      ? all.filter(l => {
          const bid = l.borrower?._id || l.borrowerId || l.borrower;
          return String(bid) === String(currentUserId);
        })
      : [];

    if (!borrowed.length) { borrowedEl.innerHTML = "<p>No borrowed items.</p>"; return; }

    borrowedEl.innerHTML = "";
    borrowed.forEach(item => {
      const card = renderBorrowedCard(item);
      borrowedEl.appendChild(card);
    });
  } catch (err) {
    console.error("loadBorrowed error:", err);
    borrowedEl.innerText = "Failed to load borrowed items";
  }
}

// End of PART 3
// js_files/lending.js — PART 4 of 6
// ------------------------------
// ACTIONS: markReturned, deleteLending

async function markReturned(id) {
  if (!id) { alert('Missing lending id'); return; }
  if (!confirm('Mark this lending as returned?')) return;

  try {
    // primary (your server uses PATCH /api/lending/:id/return)
    let res = await authFetch(`${API_BASE}/lending/${id}/return`, { method: 'PATCH' });

    // fallback: some older APIs use POST /api/lending/return/:id
    if (res && res.status === 404) {
      res = await authFetch(`${API_BASE}/lending/return/${id}`, { method: 'POST' });
    }

    if (!res) {
      alert('Mark returned failed: no response from server');
      return;
    }

    if (!res.ok) {
      let bodyText;
      try { bodyText = await res.text(); } catch (e) { bodyText = String(e); }
      // try to parse json message
      try {
        const json = JSON.parse(bodyText);
        alert('Mark returned failed: ' + (json.message || JSON.stringify(json)));
      } catch (e) {
        alert('Mark returned failed: ' + (bodyText ? bodyText.slice(0, 300) : `status ${res.status}`));
      }
      return;
    }

    // success
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    alert(data.message || 'Marked returned');

    // refresh lists
    await loadMyLendings();
    await loadBorrowed();
  } catch (err) {
    console.error('markReturned error:', err);
    alert('Failed to mark returned (see console)');
  }
}

async function deleteLending(id) {
  if (!id) { alert('Missing lending id'); return; }
  if (!confirm('Delete this lending record?')) return;

  try {
    const res = await authFetch(`${API_BASE}/lending/${id}`, { method: 'DELETE' });
    if (!res) {
      alert('Delete failed: no response from server');
      return;
    }
    if (!res.ok) {
      let bodyText;
      try { bodyText = await res.text(); } catch (e) { bodyText = String(e); }
      try {
        const json = JSON.parse(bodyText);
        alert('Delete failed: ' + (json.message || JSON.stringify(json)));
      } catch (e) {
        alert('Delete failed: ' + (bodyText ? bodyText.slice(0, 300) : `status ${res.status}`));
      }
      return;
    }

    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    alert(data.message || 'Deleted');

    // refresh lists
    await loadMyLendings();
    await loadBorrowed();
  } catch (err) {
    console.error('deleteLending error:', err);
    alert('Failed to delete (see console)');
  }
}

// End of PART 4
// js_files/lending.js — PART 5 of 6
// ------------------------------
// NOTIFICATIONS UI + Socket.IO

// Render notification list (robust)
function renderNotifications() {
  if (!notifList) return;
  if (!notifications || !notifications.length) {
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

// Fetch notifications from server (normalize response)
async function fetchNotifications() {
  try {
    const res = await authFetch(`${API_BASE}/notifications`);
    if (!res.ok) return;
    let data = await res.json();
    if (Array.isArray(data)) notifications = data;
    else if (Array.isArray(data.notifications)) notifications = data.notifications;
    else if (Array.isArray(data.data)) notifications = data.data;
    else {
      // find first array
      const firstArr = Object.values(data).find(v => Array.isArray(v));
      notifications = Array.isArray(firstArr) ? firstArr : [];
    }
    renderNotifications();
  } catch (err) {
    console.error('fetchNotifications error', err);
  }
}

// Mark a single notification read (server-side)
async function markNotificationRead(id) {
  if (!id) return;
  try {
    const url = `${API_BASE}/notifications/${id}/read`;
    const res = await authFetch(url, { method: 'PATCH' });
    if (!res || !res.ok) return;
    // update local cache
    notifications = notifications.map(n => n._id === id ? { ...n, read: true } : n);
    renderNotifications();
  } catch (err) {
    console.error('markNotificationRead error', err);
  }
}

async function markAllRead() {
  const unread = notifications.filter(n => !n.read).map(n => n._id);
  for (const id of unread) {
    // sequential to avoid bursts
    // eslint-disable-next-line no-await-in-loop
    await markNotificationRead(id);
  }
}

// Notification click handlers (delegation)
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

// small toast helper
function toast(msg) {
  if (!msg) return;
  const t = document.createElement('div');
  t.className = 'notif-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => t.classList.remove('visible'), 3000);
  setTimeout(() => t.remove(), 3500);
}

// Setup Socket.IO client (real-time)
function setupSocket() {
  try {
    const token = getTokenForSocket();
    if (!token) {
      console.warn('No token for socket auth; socket will not connect.');
      return;
    }

    // connect to server origin (ensure SOCKET_URL is correct)
    socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('Socket connected', socket.id);
      // expose socket for quick console inspection (temporary)
      try { window.__rc_socket = socket; } catch (e) { }
      // refresh notifications on connect
      fetchNotifications();
    });

    socket.on('notification', (notif) => {
      // push newest on top, keep array length bounded
      notifications.unshift(notif);
      if (notifications.length > 200) notifications = notifications.slice(0, 200);
      renderNotifications();
      toast(notif.message);
    });

    // ---------- realtime lending events ----------
    socket.on('lending:created', (payload) => {
      try {
        console.log('socket lending:created', payload);
        const lending = payload && payload.lending ? payload.lending : payload;
        // cache the new lending so it won't vanish on reload
        if (lending && lending._id) {
          tempCreatedLendings.set(String(lending._id), lending);
          setTimeout(() => tempCreatedLendings.delete(String(lending._id)), 30 * 1000);
        }

        const currentUserId = resolveCurrentUserId();

        // try to get lender id from multiple shapes; if missing, assume current user (defensive)
        const lenderId = lending?.lender?._id || lending?.lender || lending?.lenderId || lending?.lender?.id || currentUserId;

        if (String(lenderId) === String(currentUserId)) {
          // avoid duplicating the same card if it already exists at top
          if (myLendingsEl) {
            const firstCard = myLendingsEl.firstElementChild;
            const newId = lending?._id || lending?.id;
            if (firstCard && firstCard.dataset && firstCard.dataset.id === String(newId)) {
              // already present — skip
              return;
            }
            const card = renderLendingCardForLender(lending);
            if (newId) card.dataset.id = String(newId); // help identify cards
            myLendingsEl.insertBefore(card, myLendingsEl.firstChild);
          } else {
            loadMyLendings();
          }
        } else {
          // not lender: refresh borrowed list in case this affects the user
          loadBorrowed();
        }
      } catch (e) {
        console.error('lending:created handler error', e);
      }
    });

    socket.on('lending:updated', (payload) => {
      try {
        console.log('socket lending:updated', payload);
        loadMyLendings();
        loadBorrowed();
      } catch (e) { console.error('lending:updated handler error', e); }
    });

    socket.on('lending:deleted', (payload) => {
      try {
        console.log('socket lending:deleted', payload);
        loadMyLendings();
        loadBorrowed();
      } catch (e) { console.error('lending:deleted handler error', e); }
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connect error:', err && err.message ? err.message : err);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected', reason);
    });
  } catch (err) {
    console.error('setupSocket error', err);
  }
}

// End of PART 5
// ------------------------------
// js_files/lending.js — PART 6 of 6
// ------------------------------
// BOOTSTRAP / INIT: run when the page loads

(async function initLendingPage() {
  try {
    // initial data
    await loadMyLendings();
    await loadBorrowed();

    // initial notifications
    await fetchNotifications();

    // realtime
    setupSocket();

    // optional: close notif dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!notifDropdown) return;
      const withinBtn = notifBtn && notifBtn.contains(e.target);
      const withinDrop = notifDropdown.contains(e.target);
      if (!withinBtn && !withinDrop && !notifDropdown.classList.contains('hidden')) {
        notifDropdown.classList.add('hidden');
      }
    });
  } catch (err) {
    console.error('Init error:', err);
  }
})();

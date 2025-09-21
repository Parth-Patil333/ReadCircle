// js_files/lending.js — UPDATED
// ------------------------------
// Lending feature frontend: book-aware + real-time

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

// 3) OPTIONAL robust endpoint helpers
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

// 6) DOM refs
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

// runtime state
let notifications = [];
let socket = null;
const tempCreatedLendings = new Map();

// 7) borrower search logic
async function queryUsers(term) {
  if (!term || term.length < 2) return renderSuggestions([]);
  try {
    const res = await authFetch(`${API_BASE}/users?search=${encodeURIComponent(term)}`);
    if (!res.ok) return renderSuggestions([]);
    const users = await res.json();
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

// js_files/lending.js — Part 2 of 3
// ------------------------------
// CREATE LENDING + RENDERING + LOADERS

// createLendingRequest: prefer /api/lending, fallback to /api/lendings
async function createLendingRequest(payload) {
  let res = await authFetch(`${API_BASE}/lending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res && res.status === 404) {
    try {
      res = await authFetch(`${API_BASE}/lendings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // keep original res
    }
  }
  return res;
}

// Attach create form handler (uses createLendingRequest)
if (createForm) {
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Prefer bookId from an inventory select if present
    const bookIdEl = document.getElementById('bookId'); // optional select input
    const bookIdVal = bookIdEl ? (bookIdEl.value || '').trim() : '';

    // Legacy text entry (kept for compatibility)
    const bookTitle = (document.getElementById('bookTitle')?.value || '').trim();
    const bookAuthor = (document.getElementById('bookAuthor')?.value || '').trim();
    const dueDateVal = (document.getElementById('dueDate')?.value || '').trim() || null;
    const notesVal = (document.getElementById('notes')?.value || '').trim() || undefined;

    // borrower id logic (unchanged)
    const borrowerIdSelected = (document.getElementById('borrowerId')?.value || '').trim() || null;
    const borrowerSearchRaw = (document.getElementById('borrowerSearch')?.value || '').trim() || null;
    let borrowerIdToSend;
    if (borrowerIdSelected) borrowerIdToSend = borrowerIdSelected;
    else if (looksLikeObjectId(borrowerSearchRaw)) borrowerIdToSend = borrowerSearchRaw;
    else if (borrowerSearchRaw) {
      const ok = confirm("You didn't select a user from suggestions. If you typed a username or email, the server will try to resolve it. Submit anyway?");
      if (!ok) return;
      borrowerIdToSend = borrowerSearchRaw;
    } else borrowerIdToSend = undefined;

    // Build payload: prefer bookId; if not present, send legacy bookTitle/bookAuthor
    const payload = {
      borrowerId: borrowerIdToSend || undefined,
      dueDate: dueDateVal || undefined,
      notes: notesVal || undefined
    };

    if (bookIdVal && looksLikeObjectId(bookIdVal)) {
      payload.bookId = bookIdVal;
    } else if (bookTitle) {
      // legacy fallback
      payload.bookTitle = bookTitle;
      if (bookAuthor) payload.bookAuthor = bookAuthor;
    } else {
      alert('Please select a book from your inventory or enter the title.');
      return;
    }

    try {
      const res = await createLendingRequest(payload);
      if (!res) {
        alert('Failed to create lending: no response from server');
        return;
      }

      // parse JSON safely
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }

      if (!res.ok || (body && body.success === false)) {
        const msg = body && (body.message || (Array.isArray(body.errors) ? body.errors.map(x => x.msg).join('; ') : undefined)) || `Failed to create lending (status ${res.status})`;
        alert(msg);
        return;
      }

      const data = body && (body.data || body.lending) ? (body.data || body.lending) : (body || {});
      const lending = data && (data.lending || data) ? (data.lending || data) : null;

      toast(body && body.message ? body.message : 'Lending created');

      if (lending && (lending._id || lending.id)) {
        const lid = String(lending._id || lending.id);
        tempCreatedLendings.set(lid, lending);
        setTimeout(() => tempCreatedLendings.delete(lid), 30 * 1000);
      }

      // immediate UI update
      if (lending) {
        const lenderId = lending?.lender?._id || lending?.lender || lending?.lenderId || resolveCurrentUserId();
        const currentUserId = resolveCurrentUserId();
        if (String(lenderId) === String(currentUserId)) {
          if (myLendingsEl) {
            const card = renderLendingCardForLender(lending);
            const id = lending._id || lending.id || '';
            if (id) card.dataset.id = String(id);
            myLendingsEl.insertBefore(card, myLendingsEl.firstChild);
          } else {
            await loadMyLendings();
          }
        } else {
          await loadBorrowed();
        }
      } else {
        await loadMyLendings();
        await loadBorrowed();
      }

      createForm.reset();
      if (borrowerIdInput) borrowerIdInput.value = '';
      if (borrowerSearch) borrowerSearch.value = '';

      setTimeout(() => { loadMyLendings(); loadBorrowed(); }, 800);
    } catch (err) {
      console.error('create lending error:', err);
      alert('Failed to create lending (see console)');
    }
  });
}

// ------------------------------
// PART: normalize + render helpers

function normalizeLendingsResponse(payload) {
  if (!payload) return [];
  if (payload.success && Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.lendings)) return payload.lendings;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  const firstArr = Object.values(payload).find(v => Array.isArray(v));
  if (Array.isArray(firstArr)) return firstArr;
  return [];
}

// Render helpers using book-aware fields
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

  // book-aware
  const bookTitleDisplay = (item.book && (item.book.title || item.bookName)) || item.bookTitle || 'Untitled';
  const bookAuthorDisplay = (item.book && item.book.author) || item.bookAuthor || 'Unknown';

  left.innerHTML = `
    <strong>${escapeHtml(bookTitleDisplay)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
    <div class="meta">
      Author: ${escapeHtml(bookAuthorDisplay)} • Status: <strong>${escapeHtml(item.status || 'lent')}</strong>
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

function renderBorrowedCard(item) {
  const card = document.createElement("div");
  card.className = "lend-card";

  const overdue = (item.dueDate && new Date() > new Date(item.dueDate) && item.status !== "returned");

  const lenderObj = item.lender || item.lenderId || null;
  const lenderDisplay = lenderObj?.username
    ? `${escapeHtml(lenderObj.username)}${lenderObj?.email ? ` (${escapeHtml(lenderObj.email)})` : ""}`
    : (lenderObj?._id || "Lender");

  // book-aware
  const bookTitleDisplay = (item.book && (item.book.title || item.bookName)) || item.bookTitle || 'Untitled';

  const left = document.createElement("div");
  left.className = "left";
  left.innerHTML = `
    <strong>${escapeHtml(bookTitleDisplay)}</strong> ${overdue ? '<span class="tag">OVERDUE</span>' : ''}
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

// ------------------------------
// PART: loadMyLendings & loadBorrowed

async function loadMyLendings() {
  if (!myLendingsEl) return;
  myLendingsEl.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lending`);
    if (!res.ok) { myLendingsEl.innerText = "Failed to load lendings"; return; }
    let payload;
    try { payload = await res.json(); } catch (e) { myLendingsEl.innerText = "Invalid server response"; return; }
    const all = normalizeLendingsResponse(payload);

    const currentUserId = resolveCurrentUserId();
    const myLendings = currentUserId
      ? all.filter(l => {
          const lid = l.lender?._id || l.lenderId || l.lender;
          return String(lid) === String(currentUserId);
        })
      : [];

    const mergedById = new Map();
    myLendings.forEach(l => {
      const id = String(l._id || l.id || '');
      if (id) mergedById.set(id, l);
    });
    for (const [id, cached] of tempCreatedLendings.entries()) {
      if (!mergedById.has(String(id))) mergedById.set(String(id), cached);
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

async function loadBorrowed() {
  if (!borrowedEl) return;
  borrowedEl.innerHTML = "Loading...";
  try {
    const res = await authFetch(`${API_BASE}/lending`);
    if (!res.ok) { borrowedEl.innerText = "Failed to load borrowed items"; return; }
    let payload;
    try { payload = await res.json(); } catch (e) { borrowedEl.innerText = "Invalid server response"; return; }
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

// js_files/lending.js — Part 3 of 3
// ------------------------------
// ACTIONS: markReturned, deleteLending, NOTIFICATIONS, SOCKET, INIT

async function markReturned(id) {
  if (!id) { toast('Missing lending id'); return; }
  if (!confirm('Mark this lending as returned?')) return;

  try {
    let res = await authFetch(`${API_BASE}/lending/${id}/return`, { method: 'PATCH' });
    if (res && res.status === 404) {
      // fallback
      res = await authFetch(`${API_BASE}/lending/return/${id}`, { method: 'POST' });
    }
    if (!res) { alert('Mark returned failed: no response from server'); return; }

    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }

    if (!res.ok || (body && body.success === false)) {
      const msg = body && (body.message || (Array.isArray(body.errors) ? body.errors.map(x => x.msg).join('; ') : undefined)) || `Mark returned failed (status ${res.status})`;
      alert(msg);
      return;
    }

    toast(body && (body.message || 'Marked returned'));
    await loadMyLendings();
    await loadBorrowed();
  } catch (err) {
    console.error('markReturned error:', err);
    alert('Failed to mark returned (see console)');
  }
}

async function deleteLending(id) {
  if (!id) { toast('Missing lending id'); return; }
  if (!confirm('Delete this lending record?')) return;

  try {
    const res = await authFetch(`${API_BASE}/lending/${id}`, { method: 'DELETE' });
    if (!res) { alert('Delete failed: no response from server'); return; }

    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }

    if (!res.ok || (body && body.success === false)) {
      const msg = body && (body.message || (Array.isArray(body.errors) ? body.errors.map(x => x.msg).join('; ') : undefined)) || `Delete failed (status ${res.status})`;
      alert(msg);
      return;
    }

    toast(body && (body.message || 'Deleted'));
    await loadMyLendings();
    await loadBorrowed();
  } catch (err) {
    console.error('deleteLending error:', err);
    alert('Failed to delete (see console)');
  }
}

// ------------------------------
// NOTIFICATIONS UI + helpers

function renderNotifications() {
  if (!notifList) return;
  if (!notifications || !notifications.length) {
    notifList.innerHTML = '<div class="empty">No notifications</div>';
    if (notifCountElm) notifCountElm.textContent = '';
    return;
  }
  const unread = notifications.filter(n => !n.read).length;
  if (notifCountElm) notifCountElm.textContent = unread ? String(unread) : '';
  notifList.innerHTML = notifications.map(n => {
    const cls = n.read ? 'notif read' : 'notif unread';
    const linkAttr = n.link ? `data-link="${escapeHtml(n.link)}"` : '';
    return `<div class="${cls}" data-id="${escapeHtml(n._id)}" ${linkAttr}>
      <div class="message">${escapeHtml(n.message)}</div>
      <div class="meta">${escapeHtml(timeAgoOrLocal(n.createdAt))}</div>
    </div>`;
  }).join('');
}

async function fetchNotifications() {
  try {
    const res = await authFetch(`${API_BASE}/notifications`);
    if (!res || !res.ok) return;
    let data;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!data) return;
    if (Array.isArray(data)) notifications = data;
    else if (Array.isArray(data.notifications)) notifications = data.notifications;
    else if (Array.isArray(data.data)) notifications = data.data;
    else {
      const firstArr = Object.values(data).find(v => Array.isArray(v));
      notifications = Array.isArray(firstArr) ? firstArr : [];
    }
    renderNotifications();
  } catch (err) {
    console.error('fetchNotifications error', err);
  }
}

async function markNotificationRead(id) {
  if (!id) return;
  try {
    const url = `${API_BASE}/notifications/${id}/read`;
    const res = await authFetch(url, { method: 'PATCH' });
    if (!res || !res.ok) return;
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
    if (!notifDropdown) return;
    notifDropdown.classList.toggle('hidden');
    if (!notifDropdown.classList.contains('hidden')) fetchNotifications();
  });
}
if (markAllReadBtn) markAllReadBtn.addEventListener('click', () => markAllRead());

// ------------------------------
// SOCKET / realtime setup

function setupSocket() {
  try {
    // prefer shared socket (from js_files/socket.js). If absent, create local one.
    if (window.__rc_socket && window.__rc_socket.connected !== false) {
      socket = window.__rc_socket;
      console.log('Using shared socket instance', socket.id || '(no id yet)');
    } else {
      const token = getTokenForSocket();
      if (!token) {
        console.warn('No token for socket auth; socket will not connect.');
        return;
      }
      socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
      window.__rc_socket = socket;
    }

    socket.on('connect', () => {
      console.log('Socket connected', socket.id);
      fetchNotifications();
    });

    // generic notifications
    socket.on('notification', (notif) => {
      try {
        // ensure newest first
        notifications.unshift(notif);
        if (notifications.length > 200) notifications = notifications.slice(0, 200);
        renderNotifications();
        toast(notif.message);
      } catch (e) { console.error('notification handler error', e); }
    });

    // lending events
    socket.on('lending:created', (payload) => {
      try {
        const lending = payload && payload.lending ? payload.lending : payload;
        if (lending && lending._id) {
          tempCreatedLendings.set(String(lending._id), lending);
          setTimeout(() => tempCreatedLendings.delete(String(lending._id)), 30 * 1000);
        }

        const currentUserId = resolveCurrentUserId();
        const lenderId = lending?.lender?._id || lending?.lender || lending?.lenderId || currentUserId;

        if (String(lenderId) === String(currentUserId)) {
          if (myLendingsEl) {
            const firstCard = myLendingsEl.firstElementChild;
            const newId = lending?._id || lending?.id;
            if (firstCard && firstCard.dataset && firstCard.dataset.id === String(newId)) return;
            const card = renderLendingCardForLender(lending);
            if (newId) card.dataset.id = String(newId);
            myLendingsEl.insertBefore(card, myLendingsEl.firstChild);
          } else {
            loadMyLendings();
          }
        } else {
          loadBorrowed();
        }
      } catch (e) { console.error('lending:created handler error', e); }
    });

    socket.on('lending:updated', () => { loadMyLendings(); loadBorrowed(); });
    socket.on('lending:deleted', () => { loadMyLendings(); loadBorrowed(); });

    // optional inventory event (if you want to refresh lists when owner adds/deletes book)
    socket.on('inventory-updated', (payload) => {
      try {
        console.log('inventory-updated', payload);
        // if current user's inventory changed, optionally reload lending form/selects
        const currentUserId = resolveCurrentUserId();
        if (payload && payload.userId && String(payload.userId) === String(currentUserId)) {
          // if you have a select with id="bookId", refresh it (implement loadMyBooks elsewhere)
          if (typeof loadMyBooks === 'function') loadMyBooks();
        }
      } catch (e) { console.error('inventory-updated handler error', e); }
    });

    socket.on('connect_error', (err) => { console.warn('Socket connect error:', err && err.message ? err.message : err); });
    socket.on('disconnect', (reason) => { console.log('Socket disconnected', reason); });
  } catch (err) {
    console.error('setupSocket error', err);
  }
}

// ------------------------------
// BOOTSTRAP / INIT

(async function initLendingPage() {
  try {
    // load inventory first so dropdown is ready
    await loadMyBooks();

    // load lendings (my + borrowed)
    await loadMyLendings();
    await loadBorrowed();

    // load notifications
    await fetchNotifications();

    // setup realtime socket
    setupSocket();

    // auto-close notif dropdown on outside click
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

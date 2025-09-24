// js_files/buyer.js
// Listings browse, reserve/cancel, realtime updates
// Place at readcircle-frontend/js_files/buyer.js

(function () {
  // -------------------- Config --------------------
  const API_BASE = (typeof window !== 'undefined' && window.BASE_URL) ? window.BASE_URL : "https://readcircle.onrender.com/api";
  const LISTING_ENDPOINT = `${API_BASE.replace(/\/api\/?$/, '')}/api/booklisting`.replace(/\/\/api/, '/api');

  // -------------------- Auth helpers (no TDZ) --------------------
  function getTokenFallback() {
    try {
      if (typeof window.getToken === 'function') return window.getToken();
    } catch (e) { }
    try {
      return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
    } catch (e) { return null; }
  }

  async function authFetchFallback(url, opts = {}) {
    const token = authGetToken();
    const options = Object.assign({}, opts);
    options.headers = Object.assign({}, options.headers || {});

    if (typeof options.body !== 'undefined' && !(options.body instanceof FormData)) {
      if (typeof options.body === 'object') {
        try { options.body = JSON.stringify(options.body); } catch (e) { }
      }
      const hasCT = Object.keys(options.headers).some(h => h.toLowerCase() === 'content-type');
      if (!hasCT) options.headers['Content-Type'] = 'application/json';
    }

    if (token && !isTokenExpired(token)) {
      options.headers.Authorization = `Bearer ${token}`;
    }
    return fetch(url, options);
  }

  const authGetToken = (typeof window.getToken === 'function') ? window.getToken : getTokenFallback;
  const authFetchFn = (typeof window.authFetch === 'function') ? window.authFetch : authFetchFallback;

  function parseJwtSafe(token) {
    try {
      if (!token) return null;
      const b64 = token.split('.')[1];
      if (!b64) return null;
      const json = decodeURIComponent(atob(b64.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function isTokenExpired(token) {
    const p = parseJwtSafe(token);
    if (!p || !p.exp) return true;
    return Date.now() >= p.exp * 1000;
  }

  function getUserIdFromToken() {
    const token = authGetToken();
    const p = parseJwtSafe(token || '');
    if (!p) return null;
    return String(p.id || p._id || p.userId || '');
  }

  // -------------------- DOM references --------------------
  const grid = document.getElementById('listingsGrid');
  const searchInput = document.getElementById('searchInput');
  const conditionFilter = document.getElementById('conditionFilter');
  const refreshBtn = document.getElementById('refreshBtn');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  if (!grid) {
    console.info('buyer.js: listingsGrid not found on this page — buyer script will not render.');
    return;
  }

  // -------------------- Pagination state --------------------
  let page = 1;
  const limit = 12;
  let totalPages = 1;

  // -------------------- Socket setup --------------------
  function ensureSocket() {
    if (window.__rc_socket && typeof window.__rc_socket.on === 'function') {
      return window.__rc_socket;
    }
    if (typeof io !== 'function') {
      console.warn('buyer.js: socket.io client not loaded; notifications disabled.');
      return null;
    }
    const origin = window.SOCKET_URL || (API_BASE.replace(/\/api\/?$/, '')) || window.location.origin;
    const token = authGetToken();
    if (!token) {
      console.info('buyer.js: no token found; socket not connected.');
      return null;
    }
    try {
      const s = io(origin, {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 6,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
      });
      window.__rc_socket = s;
      return s;
    } catch (e) {
      console.warn('buyer.js: socket connection failed', e);
      return null;
    }
  }

  const socket = ensureSocket();
  if (socket) {
    socket.on('connect', () => console.log('Socket connected (buyer):', socket.id));
    socket.on('connect_error', (err) => console.warn('buyer socket connect_error', err && (err.message || err)));
    socket.on('listing_updated', (payload) => { console.log('buyer: listing_updated', payload); fetchAndRender(); });
    socket.on('new-listing', (payload) => { console.log('buyer: new-listing', payload); fetchAndRender(); });
    socket.on('listing_reserved', (payload) => { console.log('buyer: listing_reserved', payload); fetchAndRender(); });
    socket.on('listing_confirmed', (payload) => { console.log('buyer: listing_confirmed', payload); fetchAndRender(); });
  }
  // -------------------- Fetch & render --------------------
  async function fetchListings(params = {}) {
    const q = params.q || (searchInput ? searchInput.value : '') || '';
    const cond = params.condition || (conditionFilter ? conditionFilter.value : '') || '';
    const p = params.page || page || 1;
    const lim = params.limit || limit;

    const url = new URL(LISTING_ENDPOINT);
    url.searchParams.set('page', p);
    url.searchParams.set('limit', lim);
    if (q) url.searchParams.set('q', q);
    if (cond) url.searchParams.set('condition', cond);

    // ✅ ensure reserved listings by this buyer are included
    url.searchParams.set('includeReservedMine', '1');

    try {
      const res = await authFetchFn(url.toString(), { method: 'GET' });
      if (!res.ok) {
        console.warn('fetchListings: server returned', res.status);
        return { items: [], meta: { page: p, totalPages: 1 } };
      }
      const body = await res.json().catch(() => ({}));
      return {
        items: body.data && Array.isArray(body.data.items) ? body.data.items : (body.data || []),
        meta: body.meta || { page: p, totalPages: 1 }
      };
    } catch (err) {
      console.error('fetchListings network error', err);
      return { items: [], meta: { page: p, totalPages: 1 } };
    }
  }

  async function fetchAndRender() {
    clearGrid();
    const currentUserId = getUserIdFromToken();

    const { items, meta } = await fetchListings({ page, limit });
    totalPages = meta.totalPages || 1;

    // ✅ filter: hide my own listings as seller, but keep my reserved ones
    const visible = items.filter(l => {
      const amSeller = currentUserId && String(l.sellerId) === String(currentUserId);
      if (amSeller) return false;
      return true; // include all buyer-visible, including my reserved
    });

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerText = 'No listings found.';
      grid.appendChild(empty);
      if (pageInfo) pageInfo.innerText = `Page ${page} of ${totalPages}`;
      return;
    }

    visible.forEach(listing => {
      const c = createCard(listing);

      // ✅ Optional visual highlight if this is my reserved listing
      const currentUserId = getUserIdFromToken();
      if (listing.buyerId && String(listing.buyerId) === currentUserId) {
        c.style.border = '2px solid #ff9800';
        c.style.background = '#fff8e1';
      }

      grid.appendChild(c);
    });

    if (pageInfo) pageInfo.innerText = `Page ${page} of ${totalPages}`;
  }
  // -------------------- Actions --------------------
  async function doReserve(listingId, btn) {
    if (!confirm('Reserve this listing? This will hold it for 48 hours.')) return;
    try {
      btn.disabled = true;
      btn.innerText = 'Reserving...';
      const res = await authFetchFn(`${LISTING_ENDPOINT}/${listingId}/reserve`, { method: 'POST' });
      const bodyText = await res.text();
      let body;
      try { body = JSON.parse(bodyText); } catch (e) { body = { raw: bodyText }; }
      if (!res.ok) {
        alert((body && body.message) || 'Failed to reserve listing');
        btn.disabled = false;
        btn.innerText = 'Reserve';
        return;
      }
      // ✅ refresh so reserved card reappears highlighted
      fetchAndRender();
    } catch (err) {
      console.error('reserve error', err);
      alert('Network error while reserving');
      btn.disabled = false;
      btn.innerText = 'Reserve';
    }
  }

  async function doCancel(listingId, btn) {
    if (!confirm('Cancel your reservation?')) return;
    try {
      btn.disabled = true;
      btn.innerText = 'Cancelling...';
      const res = await authFetchFn(`${LISTING_ENDPOINT}/${listingId}/cancel`, { method: 'POST' });
      const bodyText = await res.text();
      let body;
      try { body = JSON.parse(bodyText); } catch (e) { body = { raw: bodyText }; }
      if (!res.ok) {
        alert((body && body.message) || 'Failed to cancel reservation');
        btn.disabled = false;
        btn.innerText = 'Cancel reservation';
        return;
      }
      // ✅ refresh so cancelled card disappears from reserved state and goes back to normal
      fetchAndRender();
    } catch (err) {
      console.error('cancel error', err);
      alert('Network error while cancelling');
      btn.disabled = false;
      btn.innerText = 'Cancel reservation';
    }
  }
  // -------------------- UI bindings --------------------
  if (refreshBtn) refreshBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fetchAndRender();
  });

  if (searchInput) {
    let ti = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(ti);
      ti = setTimeout(() => {
        page = 1;
        fetchAndRender();
      }, 400);
    });
  }

  if (conditionFilter) {
    conditionFilter.addEventListener('change', () => {
      page = 1;
      fetchAndRender();
    });
  }

  if (prevPageBtn) prevPageBtn.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      fetchAndRender();
    }
  });

  if (nextPageBtn) nextPageBtn.addEventListener('click', () => {
    if (page < totalPages) {
      page += 1;
      fetchAndRender();
    }
  });

  // -------------------- Initial render --------------------
  fetchAndRender();

  // -------------------- Debug helpers --------------------
  window.ReadCircleBuyer = {
    fetchAndRender,
    getUserIdFromToken
  };
})();

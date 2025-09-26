// js_files/buyer.js
// Listings browse, reserve/cancel, realtime updates
// Replace your existing buyer.js with this file.

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

    // If body is an object (not FormData), stringify it and set JSON content-type
    if (typeof options.body !== 'undefined' && !(options.body instanceof FormData)) {
      if (typeof options.body === 'object') {
        try {
          options.body = JSON.stringify(options.body);
        } catch (e) { /* leave as-is */ }
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

  // small jwt parse helper (returns payload or null)
  function parseJwtSafe(token) {
    try {
      if (!token) return null;
      const b64 = token.split('.')[1];
      if (!b64) return null;
      const json = decodeURIComponent(atob(b64.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
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

  // -------------------- DOM references (defensive) --------------------
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

  // --- Reserved-listings toggle (insert after pageInfo definition) ---
  let showReservedOnly = false; // toggle state

  // create toggle button (if page header controls exist)
  (function ensureReservedToggle() {
    const controls = document.querySelector('.controls');
    // if there's already an element with this id in HTML we will use it instead
    let reservedBtn = document.getElementById('showReservedBtn');
    if (!reservedBtn) {
      if (!controls) return; // graceful if header isn't present
      reservedBtn = document.createElement('button');
      reservedBtn.id = 'showReservedBtn';
      reservedBtn.className = 'btn';
      reservedBtn.innerText = 'Your reserved listings';
      reservedBtn.style.background = '#e9ecef';
      reservedBtn.style.color = '#111';
      reservedBtn.style.border = '1px solid #dcdcdc';
      controls.appendChild(reservedBtn);
    }
    reservedBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      showReservedOnly = !showReservedOnly;
      reservedBtn.innerText = showReservedOnly ? 'Show all listings' : 'Your reserved listings';
      // refetch / re-render: when toggled we ask server to include my reserved items
      page = 1;
      fetchAndRender();
    });
  })();

  // -------------------- Pagination state --------------------
  let page = 1;
  const limit = 12;
  let totalPages = 1;

  // -------------------- Socket setup (reuses window.__rc_socket if present) --------------------
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
    // these events trigger a refresh so UI reflects server state
    socket.on('listing_updated', (payload) => {
      console.log('buyer: listing_updated', payload);
      fetchAndRender();
    });
    socket.on('new-listing', (payload) => {
      console.log('buyer: new-listing', payload);
      fetchAndRender();
    });
    socket.on('listing_reserved', (payload) => {
      console.log('buyer: listing_reserved', payload);
      fetchAndRender();
    });
    socket.on('listing_confirmed', (payload) => {
      console.log('buyer: listing_confirmed', payload);
      fetchAndRender();
    });
  }

  // -------------------- Render helpers --------------------
  function clearGrid() {
    grid.innerHTML = '';
  }

  // Create one card. currentUserId passed so renderer can decide "reserved by me" vs others.
  function createCard(listing) {
    const card = document.createElement('div');
    card.className = 'card'; // use consistent .card from CSS

    const title = document.createElement('h4');
    title.innerText = listing.title || 'Untitled';
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerText = `${listing.author ? listing.author + ' • ' : ''}${listing.condition || ''}`;
    card.appendChild(meta);

    if (Array.isArray(listing.images) && listing.images.length) {
      const img = document.createElement('img');
      img.src = listing.images[0];
      img.alt = listing.title || 'cover';
      img.style.maxWidth = '120px';
      img.style.display = 'block';
      img.onerror = () => { img.style.opacity = '0.4'; };
      card.appendChild(img);
    }

    const price = document.createElement('div');
    price.className = 'price';
    price.innerText = `${listing.price != null ? listing.price : ''} ${listing.currency || ''}`;
    card.appendChild(price);

    const status = document.createElement('div');
    status.className = 'status';
    if (listing.buyerId) {
      status.innerText = `Reserved until ${listing.reservedUntil ? (new Date(listing.reservedUntil)).toLocaleString() : '...'}`;
    } else {
      status.innerText = 'Available';
    }
    card.appendChild(status);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const currentUserId = getUserIdFromToken();
    const amSeller = currentUserId && String(listing.sellerId) === String(currentUserId);

    if (!listing.buyerId && !amSeller) {
      const reserveBtn = document.createElement('button');
      reserveBtn.innerText = 'Reserve';
      reserveBtn.className = 'btn primary';
      reserveBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        doReserve(listing._id, reserveBtn);
      });
      actions.appendChild(reserveBtn);
    } else if (listing.buyerId && String(listing.buyerId) === currentUserId) {
      // reserved by me
      card.classList.add('reserved-mine');
      const cancelBtn = document.createElement('button');
      cancelBtn.innerText = 'Cancel reservation';
      cancelBtn.className = 'btn ghost';
      cancelBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        doCancel(listing._id, cancelBtn);
      });
      actions.appendChild(cancelBtn);
    } else if (amSeller) {
      const info = document.createElement('div');
      info.innerText = 'Your listing';
      actions.appendChild(info);
    } else {
      const info = document.createElement('div');
      info.innerText = listing.buyerId ? 'Reserved' : '';
      actions.appendChild(info);
    }

    if (listing.sellerContact && !amSeller) {
      const contact = document.createElement('div');
      contact.className = 'contact';
      contact.innerText = `Contact: ${listing.sellerContact}`;
      card.appendChild(contact);
    }

    card.appendChild(actions);
    return card;
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

    // request that server include my reserved listings (if any)
    // add includeReservedMine only if showReservedOnly is true
    if (showReservedOnly) url.searchParams.set('includeReservedMine', '1');

    try {
      // 🟢 log the final request URL
      console.log('buyer.js: fetchListings url ->', url.toString());

      const res = await authFetchFn(url.toString(), { method: 'GET' });

      // 🟢 log the raw JSON response (clone() so we can read twice)
      console.log(
        'buyer.js: fetchListings response ->',
        await res.clone().json().catch(() => ({}))
      );

      if (!res.ok) {
        console.warn('fetchListings: server returned', res.status);
        return { items: [], meta: { page: p, totalPages: 1 } };
      }

      const body = await res.json().catch(() => ({}));

      // accommodate both styles: body.data may be array or { items:[], meta:{} }
      if (body && body.data && Array.isArray(body.data)) {
        return { items: body.data, meta: body.meta || { page: p, totalPages: 1 } };
      } else if (body && body.data && body.data.items && Array.isArray(body.data.items)) {
        return { items: body.data.items, meta: body.meta || { page: p, totalPages: 1 } };
      } else if (Array.isArray(body.data)) {
        return { items: body.data, meta: body.meta || { page: p, totalPages: 1 } };
      }

      // fallback if server returns array directly
      if (Array.isArray(body)) {
        return { items: body, meta: { page: p, totalPages: 1 } };
      }

      return {
        items: body.data && Array.isArray(body.data) ? body.data : (body.data || []),
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
    totalPages = (meta && (meta.totalPages || meta.pages || meta.totalPages === 0 ? meta.totalPages : meta.pages)) || 1;

    // Filter out listings where you are the seller (buyers shouldn't see their own listings in browse)
    const visible = items.filter(l => !(currentUserId && String(l.sellerId) === String(currentUserId)));

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerText = 'No listings found.';
      grid.appendChild(empty);
      if (pageInfo) pageInfo.innerText = `Page ${page} of ${totalPages}`;
      return;
    }

    visible.forEach(listing => {
      const card = createCard(listing, currentUserId);
      grid.appendChild(card);
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
      // success
      fetchAndRender();
    } catch (err) {
      console.error('reserve error', err);
      alert('Network error while reserving');
      btn.disabled = false;
      btn.innerText = 'Reserve';
    }
  }

  async function cancelReservation(listingId, btn) {
    if (!confirm('Cancel your reservation?')) return;
    try {
      if (btn) { btn.disabled = true; btn.innerText = 'Cancelling...'; }
      const res = await authFetchFn(`${LISTING_ENDPOINT}/${listingId}/cancel`, { method: 'POST' });
      const bodyText = await res.text();
      let body;
      try { body = JSON.parse(bodyText); } catch (e) { body = { raw: bodyText }; }
      if (!res.ok) {
        alert((body && body.message) || 'Failed to cancel reservation');
        if (btn) { btn.disabled = false; btn.innerText = 'Cancel reservation'; }
        return;
      }
      fetchAndRender();
    } catch (err) {
      console.error('cancel error', err);
      alert('Network error while cancelling');
      if (btn) { btn.disabled = false; btn.innerText = 'Cancel reservation'; }
    }
  }

  // -------------------- UI bindings --------------------
  if (refreshBtn) refreshBtn.addEventListener('click', (e) => { e.preventDefault(); fetchAndRender(); });
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
  if (conditionFilter) conditionFilter.addEventListener('change', () => { page = 1; fetchAndRender(); });
  if (prevPageBtn) prevPageBtn.addEventListener('click', () => { if (page > 1) { page -= 1; fetchAndRender(); } });
  if (nextPageBtn) nextPageBtn.addEventListener('click', () => { if (page < totalPages) { page += 1; fetchAndRender(); } });

  // initial render
  fetchAndRender();

  // expose for debugging
  window.ReadCircleBuyer = {
    fetchAndRender,
    getUserIdFromToken
  };

})();

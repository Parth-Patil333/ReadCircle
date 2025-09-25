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

  // -------------------- Clear grid helper --------------------
  function clearGrid() {
    try {
      if (grid && typeof grid.innerHTML !== 'undefined') {
        grid.innerHTML = '';
      }
    } catch (e) {
      console.warn('clearGrid fallback failed', e);
    }
  }

  // -------------------- Create card helper --------------------
  // Must be defined before fetchAndRender uses it.
  function createCard(listing, opts = {}) {
    // opts: { highlightReserved: boolean }
    const highlightReserved = !!opts.highlightReserved;

    const card = document.createElement('div');
    card.className = 'listing-card';
    if (highlightReserved) card.classList.add('reserved-mine');

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

    // Normalize ids to strings for comparisons (defensive)
    const sellerIdStr = listing.sellerId ? String(listing.sellerId) : '';
    const buyerIdStr = listing.buyerId ? String(listing.buyerId) : '';
    const currentUserId = getUserIdFromToken();

    // Status/reservation info
    const status = document.createElement('div');
    status.className = 'status';
    if (buyerIdStr) {
      status.innerText = `Reserved until ${listing.reservedUntil ? (new Date(listing.reservedUntil)).toLocaleString() : '...'}`;
    } else {
      status.innerText = 'Available';
    }
    card.appendChild(status);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const amSeller = currentUserId && sellerIdStr === String(currentUserId);
    const amBuyer = currentUserId && buyerIdStr === String(currentUserId);

    // Reserve button only for available items (not mine as seller)
    if (!buyerIdStr && !amSeller) {
      const reserveBtn = document.createElement('button');
      reserveBtn.innerText = 'Reserve';
      reserveBtn.className = 'btn';
      reserveBtn.addEventListener('click', () => doReserve(listing._id, reserveBtn));
      actions.appendChild(reserveBtn);
    } else if (amBuyer) {
      // If I am the buyer who reserved, show Cancel button clearly
      const cancelBtn = document.createElement('button');
      cancelBtn.innerText = 'Cancel reservation';
      cancelBtn.className = 'btn btn-ghost';
      cancelBtn.addEventListener('click', () => doCancel(listing._id, cancelBtn));
      actions.appendChild(cancelBtn);
    } else if (amSeller) {
      const info = document.createElement('div');
      info.innerText = 'Your listing';
      actions.appendChild(info);
    } else {
      const info = document.createElement('div');
      info.innerText = buyerIdStr ? 'Reserved' : '';
      actions.appendChild(info);
    }

    // contact
    if (listing.sellerContact && !amSeller) {
      const contact = document.createElement('div');
      contact.className = 'contact';
      contact.innerText = `Contact: ${listing.sellerContact}`;
      card.appendChild(contact);
    }

    card.appendChild(actions);
    return card;
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
  // Replace existing fetchListings with this debug/normalizing version
  async function fetchListings(params = {}) {
    // params: { page, limit, q, condition }
    const q = params.q || (searchInput ? searchInput.value : '') || '';
    const cond = params.condition || (conditionFilter ? conditionFilter.value : '') || '';
    const p = params.page || page || 1;
    const lim = params.limit || limit;

    const url = new URL(LISTING_ENDPOINT);
    url.searchParams.set('page', p);
    url.searchParams.set('limit', lim);
    if (q) url.searchParams.set('q', q);
    if (cond) url.searchParams.set('condition', cond);

    // ensure reserved listings by this buyer are included
    url.searchParams.set('includeReservedMine', '1');

    // DEBUG: show URL and headers (network tab still shows headers but console is faster)
    console.debug('buyer.js: fetchListings url ->', url.toString());

    try {
      const res = await authFetchFn(url.toString(), { method: 'GET' });

      // Read text for robust logging/parsing
      const txt = await res.text().catch(() => '');
      let body;
      try {
        body = txt ? JSON.parse(txt) : {};
      } catch (e) {
        // not JSON — log raw text and bail
        console.warn('buyer.js: fetchListings response not JSON:', txt);
        return { items: [], meta: { page: p, totalPages: 1 } };
      }

      // DEBUG: log the full parsed response
      console.debug('buyer.js: fetchListings response ->', body);

      if (!res.ok) {
        console.warn('fetchListings: server returned non-OK status', res.status, body);
        return { items: [], meta: { page: p, totalPages: 1 } };
      }

      // Normalize possible shapes:
      // 1) { success:true, data: [ ... ], meta: {...} }
      // 2) { success:true, data: { items: [...], meta: {...} } }
      // 3) older shape: { data: [...], meta: {...} }
      let items = [];
      let meta = { page: p, totalPages: 1 };

      if (body) {
        // prefer body.data.items
        if (body.data && Array.isArray(body.data.items)) {
          items = body.data.items;
          meta = body.data.meta || body.meta || body.meta || meta;
        } else if (Array.isArray(body.data)) {
          items = body.data;
          meta = body.meta || meta;
        } else if (Array.isArray(body)) {
          items = body;
        } else if (body.items && Array.isArray(body.items)) {
          items = body.items;
          meta = body.meta || meta;
        } else if (body.data && Array.isArray(body.data)) {
          items = body.data;
          meta = body.meta || meta;
        }
      }

      // Ensure meta.totalPages presence if server sends total/limit
      if (!meta.totalPages && typeof meta.total === 'number' && typeof meta.limit === 'number') {
        meta.totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));
      }

      return { items, meta };
    } catch (err) {
      console.error('fetchListings network error', err);
      return { items: [], meta: { page: p, totalPages: 1 } };
    }
  }

  async function fetchAndRender() {
    // clear grid first
    grid.innerHTML = '';

    const currentUserId = getUserIdFromToken();
    const { items, meta } = await fetchListings({ page, limit });
    totalPages = meta && (meta.totalPages || meta.pages) ? (meta.totalPages || meta.pages) : 1;

    // Defensive: ensure items is an array
    const all = Array.isArray(items) ? items : [];

    // Normalize ids to strings to avoid ObjectId mismatches
    const norm = all.map(l => {
      return Object.assign({}, l, {
        __sellerId: l.sellerId ? String(l.sellerId) : '',
        __buyerId: l.buyerId ? String(l.buyerId) : ''
      });
    });

    // Visible to normal buyer: available items (not my own listings as seller)
    const available = norm.filter(l => {
      const isMyListingAsSeller = currentUserId && l.__sellerId === String(currentUserId);
      // If l is reserved by someone else (not me), hide it from available results
      const reservedByOther = l.__buyerId && l.__buyerId !== String(currentUserId);
      return !isMyListingAsSeller && !reservedByOther;
    });

    // Items reserved by *me* (so buyer can see and cancel)
    const reservedMine = norm.filter(l => currentUserId && l.__buyerId === String(currentUserId));

    // If no results show empty notice
    if (!available.length && !reservedMine.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerText = 'No listings found.';
      grid.appendChild(empty);
      if (pageInfo) pageInfo.innerText = `Page ${page} of ${totalPages}`;
      return;
    }

    // Render available items first
    available.forEach(listing => {
      const c = createCard(listing, { highlightReserved: false });
      grid.appendChild(c);
    });

    // Then render reserved-by-me group (if any) with a small header
    if (reservedMine.length) {
      const header = document.createElement('div');
      header.style.margin = '12px 0 6px';
      header.style.fontWeight = '700';
      header.innerText = 'Your reservations';
      grid.appendChild(header);

      reservedMine.forEach(listing => {
        const c = createCard(listing, { highlightReserved: true });
        grid.appendChild(c);
      });
    }

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

// js_files/buyer.js
// Listings browse, reserve/cancel, realtime updates
// Normalizer + robust token/id handling + guarded socket handling + clearer logs

(function () {
  // -------------------- Config --------------------
  const API_BASE = (typeof window !== 'undefined' && window.BASE_URL) ? window.BASE_URL : "https://readcircle.onrender.com/api";
  const LISTING_ENDPOINT = `${API_BASE.replace(/\/api\/?$/, '')}/api/booklisting`.replace(/\/\/api/, '/api');

  // -------------------- Auth helpers (local resilient wrappers) --------------------
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
        try { options.body = JSON.stringify(options.body); } catch (e) { /* ignore */ }
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

  // normalized user-id getter: checks common fields in token payload
  function getUserIdFromToken() {
    const token = authGetToken();
    const p = parseJwtSafe(token || '');
    if (!p) return null;
    return String(p.id || p._id || p.userId || p.user_id || p._userId || '');
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

  // -------------------- DOM helpers --------------------
  function clearGrid() {
    if (!grid) return;
    grid.innerHTML = '';
  }

  function showEmptyMessage(text = 'No listings found.') {
    clearGrid();
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerText = text;
    grid.appendChild(empty);
  }

  // -------------------- Reserved toggle, pagination --------------------
  let showReservedOnly = false; // toggle state

  (function ensureReservedToggle() {
    const controls = document.querySelector('.controls');
    let reservedBtn = document.getElementById('showReservedBtn');
    if (!reservedBtn) {
      if (!controls) return;
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
      page = 1;
      fetchAndRender();
    });
  })();

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
    // listen to multiple common naming variants to be tolerant
    const socketEvents = [
      'listing-updated', 'listing-created', 'listing-deleted',
      'listing_updated', 'new-listing', 'listing_reserved', 'listing_confirmed',
      'listing-updated', 'listing-created', 'listing-deleted', 'listing_reserved'
    ];
    // small debounce so rapid events don't trigger many fetches
    let socketDebounce = null;
    const triggerFetch = () => {
      clearTimeout(socketDebounce);
      socketDebounce = setTimeout(() => fetchAndRender(), 250);
    };
    socketEvents.forEach(ev => {
      socket.on(ev, (payload) => {
        try { console.log('buyer:', ev, payload); } catch (e) {}
        triggerFetch();
      });
    });
  }

  // -------------------- Render helpers / normalizer --------------------
  function normalizeListing(raw) {
    if (!raw || typeof raw !== 'object') return null;
    // direct fields
    const out = {};
    out._raw = raw;

    out._id = raw._id || raw.id || raw._id?.toString?.() || raw.id?.toString?.() || null;
    out.id = out._id || (raw.id ? String(raw.id) : null);

    // sellerId may be string or nested object
    out.sellerId = (raw.sellerId && String(raw.sellerId)) ||
                   (raw.seller && (raw.seller._id || raw.seller.id) && String(raw.seller._id || raw.seller.id)) ||
                   (raw.seller && String(raw.seller)) || null;

    // buyer/reserver detection (accept many shapes)
    out.buyerId = (raw.buyerId && String(raw.buyerId)) ||
                  (raw.buyer && (raw.buyer._id || raw.buyer.id) && String(raw.buyer._id || raw.buyer.id)) ||
                  (raw.reservedBy && (raw.reservedBy._id || raw.reservedBy.id) && String(raw.reservedBy._id || raw.reservedBy.id)) ||
                  (raw.reservedBy && String(raw.reservedBy)) ||
                  (raw.reserved && (raw.reserved.by || raw.reserved.user) && String((raw.reserved.by || raw.reserved.user))) ||
                  null;

    // reservedUntil variations
    out.reservedUntil = raw.reservedUntil || raw.reserved_until || (raw.reserved && raw.reserved.until) || raw.reservedUntil || null;

    // standard metadata
    out.title = raw.title || raw.name || (raw.book && raw.book.title) || 'Untitled';
    out.author = raw.author || (raw.book && raw.book.author) || '';
    out.condition = raw.condition || raw.state || '';
    out.price = (typeof raw.price !== 'undefined') ? raw.price : (raw.amount || null);
    out.currency = raw.currency || raw.currencyCode || raw.currency_code || '';
    out.images = Array.isArray(raw.images) ? raw.images : (raw.image ? [raw.image] : (raw.images && typeof raw.images === 'string' ? [raw.images] : []));
    out._raw = raw;
    return out;
  }

  function createCard(listing) {
    const card = document.createElement('div');
    card.className = 'card'; // matches your CSS
    card.setAttribute('data-id', String(listing._id || listing.id || ''));

    // Thumbnail container - prevents overlap with neighbors
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb';
    if (Array.isArray(listing.images) && listing.images.length) {
      const img = document.createElement('img');
      img.src = listing.images[0];
      img.alt = listing.title || 'cover';
      img.onerror = () => { img.style.opacity = '0.4'; };
      thumbWrap.appendChild(img);
    } else {
      thumbWrap.textContent = '';
    }
    card.appendChild(thumbWrap);

    // Body (text + actions)
    const body = document.createElement('div');
    body.className = 'body';

    const title = document.createElement('h4');
    title.innerText = listing.title || 'Untitled';
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerText = `${listing.author ? listing.author + ' • ' : ''}${listing.condition || ''}`;
    body.appendChild(meta);

    const price = document.createElement('div');
    price.className = 'price';
    price.innerText = `${typeof listing.price !== 'undefined' && listing.price !== null ? listing.price : ''} ${listing.currency || ''}`;
    body.appendChild(price);

    const status = document.createElement('div');
    status.className = 'status';
    if (listing.buyerId) {
      status.innerText = `Reserved until ${listing.reservedUntil ? (new Date(listing.reservedUntil)).toLocaleString() : '...'}`;
    } else {
      status.innerText = 'Available';
    }
    body.appendChild(status);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'actions';

    const currentUserId = getUserIdFromToken();
    const amSeller = currentUserId && String(listing.sellerId) === String(currentUserId);
    const reservedByMe = listing.buyerId && currentUserId && String(listing.buyerId) === String(currentUserId);

    if (!listing.buyerId && !amSeller) {
      const reserveBtn = document.createElement('button');
      reserveBtn.type = 'button';
      reserveBtn.innerText = 'Reserve';
      reserveBtn.className = 'btn primary';
      reserveBtn.style.position = 'relative';
      reserveBtn.style.zIndex = '3';
      reserveBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        doReserve(listing._id || listing.id, reserveBtn);
      });
      actions.appendChild(reserveBtn);

    } else if (reservedByMe) {
      card.classList.add('reserved-mine');

      const badge = document.createElement('div');
      badge.className = 'my-reserved-badge';
      badge.innerText = 'Reserved by you';
      card.appendChild(badge);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.innerText = 'Cancel reservation';
      cancelBtn.className = 'btn ghost';
      cancelBtn.style.position = 'relative';
      cancelBtn.style.zIndex = '3';
      cancelBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        cancelReservation(listing._id || listing.id, cancelBtn);
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
      body.appendChild(contact);
    }

    body.appendChild(actions);
    card.appendChild(body);

    card.tabIndex = 0;

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

    if (showReservedOnly) {
      url.searchParams.set('includeReservedMine', '1');
    }

    try {
      console.log('buyer.js: fetchListings url ->', url.toString());
      const res = await authFetchFn(url.toString(), { method: 'GET' });

      try { console.log('buyer.js: fetchListings response ->', await res.clone().json().catch(() => ({}))); } catch (e) { }

      if (!res.ok) {
        console.warn('fetchListings: server returned', res.status);
        return { items: [], meta: { page: p, totalPages: 1, total: 0 } };
      }

      const body = await res.json().catch(() => ({}));

      // Normalize common response shapes into an items array + meta
      let items = [];
      let meta = { page: p, totalPages: 1, total: 0 };

      if (Array.isArray(body)) {
        items = body;
      } else if (body && Array.isArray(body.data)) {
        items = body.data;
        meta = body.meta || meta;
      } else if (body && body.data && Array.isArray(body.data.items)) {
        items = body.data.items;
        meta = body.data.meta || body.meta || meta;
      } else if (body.success === true && Array.isArray(body.data)) {
        items = body.data;
        meta = body.meta || meta;
      } else {
        // fallback: attempt to find first array property
        for (const k in body) {
          if (Array.isArray(body[k])) {
            items = body[k];
            break;
          }
        }
      }

      // Return canonical normalized items
      const normalized = items.map(normalizeListing).filter(Boolean);
      return { items: normalized, meta: meta || { page: p, totalPages: 1, total: normalized.length } };
    } catch (err) {
      console.error('fetchListings network error', err);
      return { items: [], meta: { page: p, totalPages: 1, total: 0 } };
    }
  }

  async function fetchAndRender() {
    try {
      clearGrid();
      const currentUserId = getUserIdFromToken();

      const { items, meta } = await fetchListings({ page, limit });
      const totalPagesFromMeta = (meta && (meta.totalPages || meta.pages || Math.max(1, Math.ceil((meta.total || 0) / limit)))) || 1;
      totalPages = totalPagesFromMeta;

      // Work with a shallow copy
      let visible = Array.isArray(items) ? items.slice() : [];

      // Mark reservedByMe early and log reasons for dropping
      visible = visible.map(l => {
        l.reservedByMe = !!(l.buyerId && currentUserId && String(l.buyerId) === String(currentUserId));
        l.amSeller = !!(currentUserId && l.sellerId && String(l.sellerId) === String(currentUserId));
        return l;
      });

      // Exclude listings where current user is seller and not the reserver
      const before = visible.length;
      visible = visible.filter(l => {
        if (l.amSeller && !l.reservedByMe) {
          console.debug('buyer.js: excluding listing because user is seller and not reserver', l._id || l.id);
          return false;
        }
        // If showReservedOnly is active, include only reservedByMe items
        if (showReservedOnly && !l.reservedByMe) {
          return false;
        }
        return true;
      });
      const after = visible.length;
      console.debug(`buyer.js: fetchAndRender items before=${before} after=${after}`);

      if (!visible.length) {
        showEmptyMessage(showReservedOnly ? 'No reserved listings found.' : 'No listings found.');
        if (pageInfo) pageInfo.innerText = `Page ${page} of ${totalPages}`;
        return;
      }

      visible.forEach(listing => {
        const card = createCard(listing);
        grid.appendChild(card);
      });

      if (pageInfo) pageInfo.innerText = `Page ${page} of ${totalPages}`;
    } catch (err) {
      console.error('fetchAndRender error', err);
      showEmptyMessage('Error loading listings.');
      if (pageInfo) pageInfo.innerText = `Page ${page} of ${totalPages}`;
    }
  }

  // -------------------- Actions --------------------
  async function doReserve(listingId, btn) {
    if (!confirm('Reserve this listing? This will hold it for 48 hours.')) return;
    try {
      if (btn) { btn.disabled = true; btn.innerText = 'Reserving...'; }
      const res = await authFetchFn(`${LISTING_ENDPOINT}/${listingId}/reserve`, { method: 'POST' });
      const bodyText = await res.text();
      let body;
      try { body = JSON.parse(bodyText); } catch (e) { body = { raw: bodyText }; }
      if (!res.ok) {
        alert((body && body.message) || 'Failed to reserve listing');
        if (btn) { btn.disabled = false; btn.innerText = 'Reserve'; }
        return;
      }
      await fetchAndRender();
    } catch (err) {
      console.error('reserve error', err);
      alert('Network error while reserving');
      if (btn) { btn.disabled = false; btn.innerText = 'Reserve'; }
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
      await fetchAndRender();
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
    fetchListings,
    getUserIdFromToken,
    normalizeListing
  };

})();

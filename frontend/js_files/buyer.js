// js_files/buyer.js
// Listings browse, reserve/cancel, realtime updates
// Cleaned and consolidated version

(function () {
  // -------------------- Config --------------------
  const API_BASE = (typeof window !== 'undefined' && window.BASE_URL) ? window.BASE_URL : "https://readcircle.onrender.com/api";
  const LISTING_ENDPOINT = `${API_BASE.replace(/\/api\/?$/, '')}/api/booklisting`.replace(/\/\/api/, '/api');

  // -------------------- Auth helpers --------------------
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
      // keep placeholder so layout doesn't shift
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
    const reservedByMe = listing.buyerId && String(listing.buyerId) === String(currentUserId);

    if (!listing.buyerId && !amSeller) {
      // Reserve button for buyers (not seller)
      const reserveBtn = document.createElement('button');
      reserveBtn.type = 'button';
      reserveBtn.innerText = 'Reserve';
      reserveBtn.className = 'btn primary';
      // make sure button is in front and receives clicks
      reserveBtn.style.position = 'relative';
      reserveBtn.style.zIndex = '3';
      reserveBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        doReserve(listing._id || listing.id, reserveBtn);
      });
      actions.appendChild(reserveBtn);

    } else if (reservedByMe) {
      // visually mark and show cancel
      card.classList.add('reserved-mine');

      // badge (absolute positioned via CSS .my-reserved-badge)
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
        // call cancel handler; your code uses cancelReservation
        cancelReservation(listing._id || listing.id, cancelBtn);
      });
      actions.appendChild(cancelBtn);

    } else if (amSeller) {
      const info = document.createElement('div');
      info.innerText = 'Your listing';
      actions.appendChild(info);

    } else {
      // reserved by someone else
      const info = document.createElement('div');
      info.innerText = listing.buyerId ? 'Reserved' : '';
      actions.appendChild(info);
    }

    // contact (if provided and not the seller)
    if (listing.sellerContact && !amSeller) {
      const contact = document.createElement('div');
      contact.className = 'contact';
      contact.innerText = `Contact: ${listing.sellerContact}`;
      body.appendChild(contact);
    }

    body.appendChild(actions);
    card.appendChild(body);

    // accessibility: make card keyboard-focusable
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

    // Only ask server to include my reserved listings when toggle ON
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

      if (body && body.data && Array.isArray(body.data)) {
        return { items: body.data, meta: body.meta || { page: p, totalPages: 1, total: (body.data || []).length } };
      }
      if (body && body.data && body.data.items && Array.isArray(body.data.items)) {
        return { items: body.data.items, meta: body.meta || body.data.meta || { page: p, totalPages: 1, total: (body.data.items || []).length } };
      }
      if (Array.isArray(body)) {
        return { items: body, meta: { page: p, totalPages: 1, total: body.length } };
      }

      return {
        items: body.data && Array.isArray(body.data) ? body.data : (body.data || []),
        meta: body.meta || { page: p, totalPages: 1, total: (body.data && body.data.length) || 0 }
      };
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

      let visible = Array.isArray(items) ? items.slice() : [];
      // exclude listings where current user is seller
      visible = visible.filter(l => !(currentUserId && String(l.sellerId) === String(currentUserId)));

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
    getUserIdFromToken
  };

})();

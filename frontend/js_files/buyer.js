// js_files/buyer.js
// Listings (browse) + reserve/cancel + realtime updates
// Expects auth.js to provide getToken() and optionally authFetch()
// Fallbacks are present.

(function () {
  const API_BASE = window.API_BASE || "https://readcircle.onrender.com/api";
  const LISTING_ENDPOINT = `${API_BASE}/booklisting`;

  // Fallback token/getter as in seller.js
  function getTokenFallback() {
    try {
      if (typeof getToken === 'function') return getToken();
    } catch (e) {}
    try {
      const t = localStorage.getItem('token') || sessionStorage.getItem('token');
      return t || null;
    } catch (e) { return null; }
  }

  async function authFetchFallback(url, opts = {}) {
    const token = getTokenFallback();
    const headers = opts.headers || {};
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    opts.headers = headers;
    return fetch(url, opts);
  }

  const authGetToken = (typeof getToken === 'function') ? getToken : getTokenFallback;
  const authFetch = (typeof authFetch === 'function') ? authFetch : authFetchFallback;

  // DOM
  const grid = document.getElementById('listingsGrid');
  const searchInput = document.getElementById('searchInput');
  const conditionFilter = document.getElementById('conditionFilter');
  const refreshBtn = document.getElementById('refreshBtn');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  let page = 1;
  let limit = 12;
  let totalPages = 1;
  let socket = null;

  // Keep countdown timers keyed by listing id
  const timers = {};

  function connectSocket() {
    try {
      const token = authGetToken();
      if (!token) return console.warn('buyer.js: no auth token found; sockets disabled');

      socket = io(window.SOCKET_URL || (new URL(API_BASE).origin), {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket', 'polling']
      });

      socket.on('connect', () => console.log('Socket connected (buyer):', socket.id));
      socket.on('listing_updated', (payload) => {
        // Update a single card if present, or refresh list
        console.log('listing_updated', payload);
        updateOrRefreshCard(payload);
      });
      socket.on('listing_reserved', (payload) => {
        console.log('listing_reserved', payload);
        // if reservation affects current user, refresh or update UI
        updateOrRefreshAfterReservation(payload);
      });
      socket.on('listing_confirmed', (payload) => {
        console.log('listing_confirmed', payload);
        // refresh listing to reflect sold state
        fetchAndRender();
      });
      socket.on('new-listing', (payload) => {
        // new listing available — refresh or prepend
        console.log('new-listing', payload);
        fetchAndRender();
      });
    } catch (e) {
      console.warn('Socket setup failed:', e);
    }
  }

  function formatCurrency(amount, currency) {
    try {
      return `${Math.round(amount * 100) / 100} ${currency || 'INR'}`;
    } catch (e) { return `${amount} ${currency || 'INR'}`; }
  }

  // Create card DOM
  function createCard(listing) {
    const id = listing._id || listing.id;
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = id;

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.src = (listing.images && listing.images[0]) || '/images/placeholder-book.png';
    img.onerror = () => img.src = '/images/placeholder-book.png';
    thumb.appendChild(img);

    const body = document.createElement('div');
    body.className = 'body';

    const title = document.createElement('h3');
    title.innerText = listing.title || 'Untitled';
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerText = listing.author ? listing.author : 'Unknown author';
    body.appendChild(meta);

    const price = document.createElement('div');
    price.className = 'price';
    price.innerText = formatCurrency(listing.price || 0, listing.currency || 'INR');
    body.appendChild(price);

    const cond = document.createElement('div');
    cond.className = 'meta';
    cond.innerText = `Condition: ${listing.condition || 'Good'}`;
    body.appendChild(cond);

    // contact or reserved info
    const infoRow = document.createElement('div');
    infoRow.className = 'meta';

    // Determine availability: if buyerId exists and reservedUntil in future -> reserved
    const now = new Date();
    const reservedUntil = listing.reservedUntil ? new Date(listing.reservedUntil) : null;
    const isReserved = listing.buyerId && reservedUntil && reservedUntil.getTime() > Date.now();
    const isReservedByMe = isReserved && (String(listing.buyerId) === String(getTokenUserId()));

    if (isReserved) {
      // show reserved countdown
      const cd = document.createElement('div');
      cd.className = 'countdown';
      cd.id = `countdown_${id}`;
      infoRow.appendChild(cd);

      // start countdown
      startCountdown(id, reservedUntil);
    } else {
      const avail = document.createElement('div');
      avail.innerText = 'Available';
      infoRow.appendChild(avail);
    }

    // contact visible if reserved by me or if reservation was confirmed (sold) (server keeps buyerId)
    if (isReservedByMe || (!listing.reservedUntil && listing.buyerId && String(listing.buyerId) === String(getTokenUserId()))) {
      if (listing.sellerContact) {
        const contact = document.createElement('div');
        contact.className = 'contact';
        contact.innerText = `Contact: ${listing.sellerContact}`;
        infoRow.appendChild(contact);
      }
    }

    body.appendChild(infoRow);

    // actions
    const actions = document.createElement('div');
    actions.className = 'actions';

    if (!isReserved) {
      // show Reserve button
      const reserveBtn = document.createElement('button');
      reserveBtn.className = 'btn primary small';
      reserveBtn.innerText = 'Reserve';
      reserveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        doReserve(id, reserveBtn);
      });
      actions.appendChild(reserveBtn);
    } else {
      // reserved: show Cancel if I'm buyer
      if (isReservedByMe) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn ghost small';
        cancelBtn.innerText = 'Cancel Reservation';
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          doCancel(id, cancelBtn);
        });
        actions.appendChild(cancelBtn);
      } else {
        const reservedLabel = document.createElement('div');
        reservedLabel.innerText = 'Reserved';
        reservedLabel.className = 'meta';
        actions.appendChild(reservedLabel);
      }
    }

    body.appendChild(actions);

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  function clearTimers() {
    Object.values(timers).forEach(t => clearInterval(t));
    Object.keys(timers).forEach(k => delete timers[k]);
  }

  // Start countdown that updates element #countdown_<id>
  function startCountdown(id, untilDate) {
    const el = document.getElementById(`countdown_${id}`);
    if (!el) return;

    // clear previous
    if (timers[id]) { clearInterval(timers[id]); delete timers[id]; }

    function tick() {
      const left = untilDate.getTime() - Date.now();
      if (left <= 0) {
        el.innerText = 'Reservation expired';
        clearInterval(timers[id]);
        delete timers[id];
        // request a refresh to update UI
        // don't spam; small delay
        setTimeout(fetchAndRender, 800);
        return;
      }
      const hours = Math.floor(left / (1000 * 60 * 60));
      const mins = Math.floor((left % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((left % (1000 * 60)) / 1000);
      el.innerText = `${hours}h ${mins}m ${secs}s left`;
    }
    tick();
    timers[id] = setInterval(tick, 1000);
  }

  // Utility: try to get current user's id by parsing token (JWT)
  function getTokenUserId() {
    try {
      const token = authGetToken();
      if (!token) return null;
      const t = String(token).replace(/^Bearer\s+/i, '');
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload.id || payload._id || payload.userId || payload.id;
    } catch (e) {
      return null;
    }
  }

  // Fetch listings and render
  async function fetchAndRender() {
    try {
      grid.innerHTML = 'Loading...';
      const q = searchInput.value.trim();
      const condition = conditionFilter.value;
      const url = new URL(LISTING_ENDPOINT);
      url.searchParams.set('page', page);
      url.searchParams.set('limit', limit);
      if (q) url.searchParams.set('q', q);
      if (condition) url.searchParams.set('condition', condition);

      const res = await fetch(url.toString(), { method: 'GET' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        grid.innerHTML = `<div class="card"><div class="body"><p>Error loading listings</p></div></div>`;
        return;
      }

      const items = body.data || [];
      const meta = body.meta || {};
      totalPages = meta.pages || 1;
      pageInfo.innerText = `Page ${meta.page || page} / ${totalPages}`;

      // Clear timers to avoid duplicate intervals
      clearTimers();

      grid.innerHTML = '';
      if (!items.length) {
        grid.innerHTML = '<div class="card"><div class="body"><p>No listings found.</p></div></div>';
        return;
      }

      items.forEach(item => {
        const card = createCard(item);
        grid.appendChild(card);
      });
    } catch (err) {
      console.error('fetch listings error', err);
      grid.innerHTML = `<div class="card"><div class="body"><p>Network error</p></div></div>`;
    }
  }

  // Reserve action
  async function doReserve(listingId, btn) {
    try {
      btn.disabled = true;
      btn.innerText = 'Reserving...';
      const res = await authFetch(`${LISTING_ENDPOINT}/${listingId}/reserve`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((body && body.message) || 'Failed to reserve listing');
        btn.disabled = false;
        btn.innerText = 'Reserve';
        return;
      }
      // success - replace card or refresh
      fetchAndRender();
    } catch (err) {
      console.error('reserve error', err);
      alert('Network error');
      btn.disabled = false;
      btn.innerText = 'Reserve';
    }
  }

  // Cancel reservation
  async function doCancel(listingId, btn) {
    try {
      btn.disabled = true;
      btn.innerText = 'Canceling...';
      const res = await authFetch(`${LISTING_ENDPOINT}/${listingId}/cancel`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((body && body.message) || 'Failed to cancel');
        btn.disabled = false;
        btn.innerText = 'Cancel Reservation';
        return;
      }
      fetchAndRender();
    } catch (err) {
      console.error('cancel error', err);
      alert('Network error');
      btn.disabled = false;
      btn.innerText = 'Cancel Reservation';
    }
  }

  // Update a card if present in DOM or refresh list
  function updateOrRefreshCard(listing) {
    if (!listing || !listing._id) return;
    const id = listing._id;
    const existing = document.querySelector(`.card[data-id="${id}"]`);
    if (existing) {
      // simple replacement: re-render whole list for correctness
      fetchAndRender();
    } else {
      // not present in current page — ignore or fetch new
      // For simplicity, refresh current page
      fetchAndRender();
    }
  }

  function updateOrRefreshAfterReservation(payload) {
    // payload: { listingId, buyerId, reservedAt, reservedUntil }
    fetchAndRender();
  }

  // Events
  refreshBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fetchAndRender();
  });

  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      page = 1;
      fetchAndRender();
    }
  });

  conditionFilter.addEventListener('change', () => {
    page = 1;
    fetchAndRender();
  });

  prevPageBtn.addEventListener('click', () => {
    if (page <= 1) return;
    page--;
    fetchAndRender();
  });
  nextPageBtn.addEventListener('click', () => {
    if (page >= totalPages) return;
    page++;
    fetchAndRender();
  });

  // Init
  (function init() {
    fetchAndRender();
    connectSocket();
  })();

})();

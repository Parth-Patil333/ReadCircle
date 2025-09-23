// js_files/buyer.js (fixed)
// Listings (browse) + reserve/cancel + realtime updates

(function () {
  const API_BASE = window.API_BASE || "https://readcircle.onrender.com/api";
  const LISTING_ENDPOINT = `${API_BASE}/booklisting`;

  function getTokenFallback() {
    try {
      if (typeof window.getToken === 'function') return window.getToken();
    } catch (e) {}
    try {
      const t = localStorage.getItem('token') || sessionStorage.getItem('token');
      return t || null;
    } catch (e) { return null; }
  }

  async function authFetchFallback(url, opts = {}) {
    const token = authGetToken();
    const headers = opts.headers || {};
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    opts.headers = headers;
    return fetch(url, opts);
  }

  const authGetToken = (typeof window.getToken === 'function') ? window.getToken : getTokenFallback;
  const authFetchFn = (typeof window.authFetch === 'function') ? window.authFetch : authFetchFallback;

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
        console.log('listing_updated', payload);
        updateOrRefreshCard(payload);
      });
      socket.on('listing_reserved', (payload) => {
        console.log('listing_reserved', payload);
        updateOrRefreshAfterReservation(payload);
      });
      socket.on('listing_confirmed', (payload) => {
        console.log('listing_confirmed', payload);
        fetchAndRender();
      });
      socket.on('new-listing', (payload) => {
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

  function createCard(listing) {
    // same as before; omitted here for brevity — keep your original createCard() implementation
    // but ensure calls to getTokenUserId() use authGetToken()
    // For simplicity, we will re-render whole list on updates using fetchAndRender()
    // ...
  }

  // For brevity, reuse your existing implementations for the rest of buyer.js
  // but make sure network calls use authFetchFn instead of authFetch
  // and token parsing uses authGetToken()
  // The minimal change is replacing authFetch with authFetchFn across the file.

  // Example reserve function:
  async function doReserve(listingId, btn) {
    try {
      btn.disabled = true;
      btn.innerText = 'Reserving...';
      const res = await authFetchFn(`${LISTING_ENDPOINT}/${listingId}/reserve`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((body && body.message) || 'Failed to reserve listing');
        btn.disabled = false;
        btn.innerText = 'Reserve';
        return;
      }
      fetchAndRender();
    } catch (err) {
      console.error('reserve error', err);
      alert('Network error');
      btn.disabled = false;
      btn.innerText = 'Reserve';
    }
  }

  // rest of code same as before but replace authFetch -> authFetchFn and getTokenUserId uses authGetToken

  // Init
  (function init() {
    fetchAndRender();
    connectSocket();
  })();

})();

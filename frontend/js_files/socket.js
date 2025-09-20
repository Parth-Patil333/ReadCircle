// js_files/socket.js
// ReadCircle: minimal Socket.IO client for Buy/Sell (listings)
// - Only listens for buy/sell/listing events
// - Save this as frontend/js_files/socket.js
// - Assumes login.js saved token to localStorage.token

(function () {
  // --- config ---
  // derive BASE_URL from window if set, otherwise fall back to default
const BASE_URL = (typeof window !== 'undefined' && window.BASE_URL) ? window.BASE_URL : "https://readcircle.onrender.com/api";
// derive socket endpoint from BASE_URL by removing trailing /api
const SOCKET_URL = String(BASE_URL).replace(/\/api\/?$/, '');

  // --- auth token (same as login.js) ---
  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
  }

  const token = getToken();
  if (!token) {
    console.info('socket.js: no token found, socket will not connect (user not logged in).');
    window.__rc_socket = null;
    return;
  }

  if (typeof io !== 'function') {
    console.error('socket.js: socket.io client lib not loaded. Include CDN before socket.js');
    window.__rc_socket = null;
    return;
  }

  // connect using handshake auth (server verifies this, your server expects handshake.auth.token)
  const socket = io(SOCKET_URL, {
    auth: { token: `Bearer ${token}` },
    transports: ['websocket'],
    autoConnect: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  // --- event handlers for buy/sell/listings ---
  // Event names used below are examples; match them to what backend emits.
  // If your backend emits different event names, replace here.
  socket.on('connect', () => {
    console.log('ReadCircle socket connected', socket.id);
  });

  socket.on('listing-created', (payload) => {
    // payload: { type: 'listing-created', listingId, title, sellerId, sellerName, ... }
    console.log('listing-created', payload);
    // call a page-level handler if present
    if (typeof window.onListingCreated === 'function') {
      try { window.onListingCreated(payload); } catch (e) { console.error(e); }
    }
    // optional default: dispatch custom event on document for page scripts to listen
    document.dispatchEvent(new CustomEvent('rc:listing-created', { detail: payload }));
  });

  socket.on('listing-updated', (payload) => {
    console.log('listing-updated', payload);
    if (typeof window.onListingUpdated === 'function') {
      try { window.onListingUpdated(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:listing-updated', { detail: payload }));
  });

  socket.on('listing-deleted', (payload) => {
    console.log('listing-deleted', payload);
    if (typeof window.onListingDeleted === 'function') {
      try { window.onListingDeleted(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:listing-deleted', { detail: payload }));
  });

  socket.on('purchase-made', (payload) => {
    // payload: { type:'purchase-made', listingId, buyerId, buyerName, status, ... }
    console.log('purchase-made', payload);
    if (typeof window.onPurchaseMade === 'function') {
      try { window.onPurchaseMade(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:purchase-made', { detail: payload }));
  });

  // generic notification fallback for buy/sell channel
  socket.on('notification', (payload) => {
    // backend may emit generic notification events, filter for buy/sell
    if (payload && payload.type && String(payload.type).startsWith('listing')) {
      document.dispatchEvent(new CustomEvent('rc:notification', { detail: payload }));
    }
  });

  socket.on('disconnect', (reason) => {
    console.warn('ReadCircle socket disconnected', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('ReadCircle socket connect_error', err && (err.message || err));
  });

  // expose socket for page scripts and debugging
  window.__rc_socket = socket;
})();

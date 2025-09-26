// js_files/socket.js
// ReadCircle: unified Socket.IO client
// - Marketplace events (including reserved/confirmed)
// - Inventory updates
// - Lending events
// - Notifications

(function () {
  const BASE_URL = (typeof window !== 'undefined' && window.BASE_URL)
    ? window.BASE_URL
    : "https://readcircle.onrender.com/api";
  const SOCKET_URL = window.SOCKET_URL || (String(BASE_URL).replace(/\/api\/?$/, '')) || window.location.origin;

  function getToken() {
    const keys = ['token', 'authToken', 'jwt', 'accessToken'];
    for (const k of keys) {
      const v = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (v) return v;
    }
    const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
    return null;
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

  const socket = io(SOCKET_URL, {
    auth: { token: `Bearer ${token}` },
    transports: ['websocket'],
    autoConnect: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  // --- connection handlers ---
  socket.on('connect', () => {
    console.log('ReadCircle socket connected', socket.id);
  });
  socket.on('disconnect', (reason) => {
    console.warn('ReadCircle socket disconnected', reason);
  });
  socket.on('connect_error', (err) => {
    console.error('ReadCircle socket connect_error', err && (err.message || err));
  });

  // --- Marketplace / Listing events ---
  socket.on('listing-created', (payload) => {
    console.log('listing-created', payload);
    if (typeof window.onListingCreated === 'function') {
      try { window.onListingCreated(payload); } catch (e) { console.error(e); }
    }
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
    console.log('purchase-made', payload);
    if (typeof window.onPurchaseMade === 'function') {
      try { window.onPurchaseMade(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:purchase-made', { detail: payload }));
  });

  // --- NEW: Reserved/Confirmed events ---
  socket.on('listing_reserved', (payload) => {
    console.log('listing_reserved', payload);
    document.dispatchEvent(new CustomEvent('rc:listing-reserved', { detail: payload }));
  });

  socket.on('listing_confirmed', (payload) => {
    console.log('listing_confirmed', payload);
    document.dispatchEvent(new CustomEvent('rc:listing-confirmed', { detail: payload }));
  });

  // --- Inventory events ---
  socket.on('inventory-updated', (payload) => {
    console.log('inventory-updated', payload);
    if (typeof window.onInventoryUpdated === 'function') {
      try { window.onInventoryUpdated(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:inventory-updated', { detail: payload }));
  });

  // --- Lending events ---
  socket.on('lending:created', (payload) => {
    console.log('lending:created', payload);
    if (typeof window.onLendingCreated === 'function') {
      try { window.onLendingCreated(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:lending-created', { detail: payload }));
  });

  socket.on('lending:updated', (payload) => {
    console.log('lending:updated', payload);
    if (typeof window.onLendingUpdated === 'function') {
      try { window.onLendingUpdated(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:lending-updated', { detail: payload }));
  });

  socket.on('lending:deleted', (payload) => {
    console.log('lending:deleted', payload);
    if (typeof window.onLendingDeleted === 'function') {
      try { window.onLendingDeleted(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:lending-deleted', { detail: payload }));
  });

  // --- Notifications ---
  socket.on('notification', (payload) => {
    console.log('notification', payload);
    if (typeof window.onNotification === 'function') {
      try { window.onNotification(payload); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('rc:notification', { detail: payload }));
  });

  window.__rc_socket = socket;
})();

// js_files/notification_socket.js
// Safe notifications socket helper — reuses existing window.__rc_socket if present,
// otherwise creates its own socket (after auth.js loaded).

(function () {
  // Small toast helper (keeps styling inline so no external CSS required)
  function createToast(text, opts = {}) {
    const containerId = 'rc_toast_container';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.position = 'fixed';
      container.style.right = '16px';
      container.style.top = '16px';
      container.style.zIndex = 99999;
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.minWidth = '220px';
    toast.style.background = opts.background || '#0b7285';
    toast.style.color = opts.color || '#fff';
    toast.style.padding = '10px 12px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 8px 30px rgba(10,20,40,0.12)';
    toast.innerText = text;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 300ms';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, opts.timeout || 4000);
  }

  // get token helper (uses auth.js getToken if available)
  function getTokenLocal() {
    try {
      if (typeof window.getToken === 'function') return window.getToken();
    } catch (e) {}
    try {
      return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
    } catch (e) { return null; }
  }

  // The main connect logic; will reuse window.__rc_socket if present
  function ensureSocket() {
    // If a global socket already exists (socket.js created it), reuse it
    if (window.__rc_socket && typeof window.__rc_socket.on === 'function') {
      return window.__rc_socket;
    }

    // Otherwise attempt to create one here (defensive)
    if (typeof io !== 'function') {
      console.warn('notifications_socket: socket.io client not loaded; skipping auto-connect');
      return null;
    }

    const token = getTokenLocal();
    if (!token) {
      console.warn('notifications_socket: no auth token found; not connecting socket');
      return null;
    }

    // Derive origin from current location or optional window.SOCKET_URL
    const origin = window.SOCKET_URL || (window.location.origin);

    try {
      const s = io(origin, { auth: { token: `Bearer ${token}` }, transports: ['websocket', 'polling'] });
      // attach to window so other scripts can reuse
      window.__rc_socket = s;
      return s;
    } catch (err) {
      console.warn('notifications_socket: failed to create socket', err);
      return null;
    }
  }

  const socket = ensureSocket();
  if (!socket) return;

  // show connection in console
  socket.on('connect', () => {
    console.log('notifications: socket connected', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.warn('notifications: connect_error', err && err.message ? err.message : err);
  });

  // listen for the events we expect (the server emits names like listing_reserved etc.)
  socket.on('new-listing', (payload) => {
    createToast('New listing: ' + (payload.title || 'Untitled'));
  });

  socket.on('listing_reserved', (payload) => {
    createToast('Listing reserved' + (payload.listingId ? ` (${payload.listingId})` : ''));
  });

  socket.on('listing_confirmed', (payload) => {
    createToast('Reservation confirmed' + (payload.listingId ? ` (${payload.listingId})` : ''));
  });

  socket.on('listing_updated', (payload) => {
    createToast('Listing updated' + (payload.title ? `: ${payload.title}` : ''));
  });

  socket.on('listing_deleted', () => {
    createToast('A listing was removed');
  });

  // make available for debugging
  window.ReadCircleNotifications = {
    getSocket: () => socket
  };
})();

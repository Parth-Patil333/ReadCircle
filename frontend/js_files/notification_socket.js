// js_files/notification_socket.js
// Safe notifications socket helper — reuses existing window.__rc_socket if present

(function () {
  // toast helper
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

  function getTokenLocal() {
    try {
      if (typeof window.getToken === 'function') return window.getToken();
    } catch (e) {}
    try {
      return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
    } catch (e) { return null; }
  }

  function ensureSocket() {
    if (window.__rc_socket && typeof window.__rc_socket.on === 'function') {
      return window.__rc_socket;
    }
    if (typeof io !== 'function') {
      console.warn('notification_socket: socket.io client not loaded');
      return null;
    }
    const token = getTokenLocal();
    if (!token) {
      console.warn('notification_socket: no auth token found');
      return null;
    }
    const origin = window.SOCKET_URL || window.location.origin;
    try {
      const s = io(origin, { auth: { token: `Bearer ${token}` }, transports: ['websocket'] });
      window.__rc_socket = s;
      return s;
    } catch (err) {
      console.warn('notification_socket: failed to connect', err);
      return null;
    }
  }

  const socket = ensureSocket();
  if (!socket) return;

  socket.on('connect', () => {
    console.log('notification_socket: connected', socket.id);
  });
  socket.on('connect_error', (err) => {
    console.warn('notification_socket: connect_error', err && err.message ? err.message : err);
  });

  // Marketplace notifications
  socket.on('listing-created', (p) => createToast('New listing: ' + (p.title || 'Untitled')));
  socket.on('listing-updated', (p) => createToast('Listing updated: ' + (p.title || '')));
  socket.on('listing-deleted', () => createToast('A listing was removed'));
  socket.on('listing_reserved', (p) => createToast('Listing reserved' + (p.listingId ? ` (${p.listingId})` : '')));
  socket.on('listing_confirmed', (p) => createToast('Reservation confirmed' + (p.listingId ? ` (${p.listingId})` : '')));

  // expose
  window.ReadCircleNotifications = {
    getSocket: () => socket
  };
})();

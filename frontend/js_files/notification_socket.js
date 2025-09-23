// js_files/notifications.js
// Simple notifications module for ReadCircle
// - Connects to socket with token (reads from getToken() or localStorage)
// - Shows simple toasts on events
// - Exposes connectNotifications() if you want to call manually

(function () {
  const API_BASE = window.API_BASE || "https://readcircle.onrender.com/api";
  const ORIGIN = window.SOCKET_URL || (new URL(API_BASE).origin);

  // token helper: attempts getToken() then localStorage/sessionStorage
  function getTokenLocal() {
    try {
      if (typeof getToken === 'function') return getToken();
    } catch (e) {}
    try {
      return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
    } catch (e) { return null; }
  }

  // simple toast implementation
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

  let socket = null;

  function connectNotifications() {
    try {
      const token = getTokenLocal();
      if (!token) {
        // Not logged in — still create a socket-less notification experience? skip.
        return console.warn('notifications: no token, not connecting socket');
      }

      socket = io(ORIGIN, {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket', 'polling']
      });

      socket.on('connect', () => {
        console.log('notifications: socket connected', socket.id);
      });

      socket.on('connect_error', (err) => {
        console.warn('notifications: connect_error', err && err.message ? err.message : err);
      });

      // IMPORTANT events to listen for
      socket.on('new-listing', (payload) => {
        createToast('New listing added: ' + (payload.title || 'Untitled'));
      });

      socket.on('listing_reserved', (payload) => {
        createToast('Your listing was reserved' + (payload.listingId ? ` (${payload.listingId})` : ''));
      });

      socket.on('listing_confirmed', (payload) => {
        createToast('A listing reservation was confirmed' + (payload.listingId ? ` (${payload.listingId})` : ''));
      });

      socket.on('listing_updated', (payload) => {
        // lightweight notification for updates
        createToast('Listing updated' + (payload.title ? `: ${payload.title}` : ''));
      });

      socket.on('listing_deleted', (payload) => {
        createToast('A listing was removed');
      });

      // expose socket for debugging
      window.__rc_socket = socket;
    } catch (err) {
      console.warn('notifications.connect failed', err);
    }
  }

  // Auto-connect when script loads (if desired)
  if (typeof window !== 'undefined') {
    // Try to auto-connect but don't crash
    try { connectNotifications(); } catch (e) { /* ignore */ }
  }

  // Expose for manual control
  window.ReadCircleNotifications = {
    connect: connectNotifications,
    getSocket: () => socket
  };
})();

// js_files/seller.js (fixed)
// Create Listing page logic for ReadCircle
// Expects: auth.js to provide window.getToken() and optionally window.authFetch()
// If not present, falls back to localStorage token and a simple authFetch wrapper.

(function () {
  const API_BASE = window.API_BASE || "https://readcircle.onrender.com/api";
  const LISTING_ENDPOINT = `${API_BASE}/booklisting`;

  // Fallback token getter
  function getTokenFallback() {
    try {
      if (typeof window.getToken === 'function') return window.getToken();
    } catch (e) { }
    try {
      return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
    } catch (e) { return null; }
  }

  // Fallback authFetch that attaches Authorization header
  async function authFetchFallback(url, opts = {}) {
    const token = authGetToken();
    const headers = opts.headers || {};
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    opts.headers = headers;
    return fetch(url, opts);
  }

  // Prefer window-provided helpers if present
  const authGetToken = (typeof window.getToken === 'function') ? window.getToken : getTokenFallback;
  const authFetchFn = (typeof window.authFetch === 'function') ? window.authFetch : authFetchFallback;

  // DOM elements (defensive)
  const form = document.getElementById('createListingForm');
  const titleEl = document.getElementById('title');
  const authorEl = document.getElementById('author');
  const conditionEl = document.getElementById('condition');
  const priceEl = document.getElementById('price');
  const currencyEl = document.getElementById('currency');
  const imagesEl = document.getElementById('images');
  const sellerContactEl = document.getElementById('sellerContact');
  const createBtn = document.getElementById('createBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusText = document.getElementById('statusText');
  const imagePreview = document.getElementById('imagePreview');

  if (!form) {
    // Not on create page — nothing to do
    return;
  }

  // Socket connection
  let socket = null;
  function connectSocket() {
    try {
      const token = authGetToken();
      if (!token) return console.warn('seller.js: no auth token; sockets disabled');

      socket = io(window.SOCKET_URL || (new URL(API_BASE).origin), {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket', 'polling']
      });

      socket.on('connect', () => console.log('Socket connected (seller)', socket.id));
      socket.on('connect_error', (err) => console.warn('Socket connect error:', err && err.message ? err.message : err));
      socket.on('listing_reserved', (payload) => console.log('listing_reserved:', payload));
      socket.on('listing_confirmed', (payload) => console.log('listing_confirmed:', payload));
      socket.on('listing_updated', (payload) => console.log('listing_updated:', payload));
    } catch (e) {
      console.warn('Socket setup failed:', e);
    }
  }

  // Image preview helper
  function renderImagePreview() {
    imagePreview.innerHTML = '';
    const raw = imagesEl.value || '';
    const urls = raw.split(',').map(s => s.trim()).filter(Boolean);
    urls.forEach(u => {
      const img = document.createElement('img');
      img.src = u;
      img.onerror = () => img.style.opacity = '0.4';
      imagePreview.appendChild(img);
    });
  }

  imagesEl.addEventListener('input', renderImagePreview);

  // Clear form
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    form.reset();
    imagePreview.innerHTML = '';
    statusText.innerText = '';
  });

  // DEBUG submit handler: paste over your existing submit listener
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // read DOM element for title (debug)
    const titleElDebug = document.getElementById('title');
    console.log('DEBUG: titleElDOM ->', titleElDebug);
    console.log('DEBUG: titleEl.value ->', titleElDebug ? titleElDebug.value : null);

    statusText.innerText = 'Creating...';
    createBtn.disabled = true;

    // Basic validation on client
    const title = titleElDebug && titleElDebug.value ? titleElDebug.value.trim() : '';
    if (!title) {
      statusText.innerText = 'Error: title is required (client)';
      createBtn.disabled = false;
      return;
    }

    // Build images array (filter data-URIs etc.)
    const rawImages = (imagesEl.value || '').split(',').map(x => x.trim()).filter(Boolean);
    const finalImages = rawImages.filter(u => !u.startsWith('data:') && String(u).length <= 2000);

    const payload = {
      title,
      author: authorEl.value && authorEl.value.trim(),
      condition: conditionEl.value,
      price: priceEl.value ? Number(priceEl.value) : 0,
      currency: currencyEl.value ? currencyEl.value.trim() : 'INR',
      images: finalImages,
      sellerContact: sellerContactEl.value ? sellerContactEl.value.trim() : undefined
    };

    // Debug logging BEFORE sending
    console.log('DEBUG: About to send payload:', payload);

    try {
      // Use authFetchFn (already defined in your file) - it attaches Authorization and headers
      const res = await authFetchFn(LISTING_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
        // Note: do NOT rely on url-encoded forms; server expects JSON body.
      });

      // Log raw response body text (helps when error returns non-json)
      const rawText = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(rawText); } catch (e) { parsed = { rawText }; }

      console.log('DEBUG: server response status', res.status, parsed);

      if (!res.ok) {
        statusText.innerText = `Error: ${(parsed && parsed.message) ? parsed.message : 'Server error'}`;
        createBtn.disabled = false;
        return;
      }

      // success
      statusText.innerText = 'Listing created ✅';
      setTimeout(() => {
        window.location.href = window.LISTINGS_PAGE || 'listing.html';
      }, 800);
    } catch (err) {
      console.error('DEBUG: create listing network error', err);
      statusText.innerText = 'Error creating listing (network)';
      createBtn.disabled = false;
    }
  });

  // Init
  (function init() {
    const token = authGetToken();
    if (!token) {
      statusText.innerText = 'You must be logged in to create a listing';
      createBtn.disabled = true;
      return;
    }
    connectSocket();
    renderImagePreview();
  })();
})();

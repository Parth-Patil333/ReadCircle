// js_files/seller.js
// Create Listing page logic for ReadCircle
// Expects: auth.js to provide getToken() and optionally authFetch()
// If authFetch not present, a small fallback is provided.

(function () {
  const API_BASE = window.API_BASE || "https://readcircle.onrender.com/api"; // override if needed
  const LISTING_ENDPOINT = `${API_BASE}/booklisting`;

  // Fallback small auth helpers if your auth.js doesn't export them
  // If you already have authFetch/getToken in your auth.js, they will be used.
  function getTokenFallback() {
    // try cookies or localStorage by convention used in your project
    try {
      if (typeof getToken === 'function') return getToken(); // if auth.js provided it
    } catch (e) {}
    try {
      const t = localStorage.getItem('token') || sessionStorage.getItem('token');
      return t || null;
    } catch (e) { return null; }
  }

  // small authFetch wrapper if none present
  async function authFetchFallback(url, opts = {}) {
    const token = getTokenFallback();
    const headers = opts.headers || {};
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    opts.headers = headers;
    return fetch(url, opts);
  }

  // Use auth-provided helpers if available
  const authGetToken = (typeof getToken === 'function') ? getToken : getTokenFallback;
  const authFetch = (typeof authFetch === 'function') ? authFetch : authFetchFallback;

  // DOM
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

  // Socket connection (optional but helpful)
  let socket = null;
  function connectSocket() {
    try {
      const token = authGetToken();
      if (!token) return console.warn('seller.js: no auth token found; sockets disabled');
      // connect with token in handshake.auth.token
      socket = io(window.SOCKET_URL || (new URL(API_BASE).origin), {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket', 'polling']
      });

      socket.on('connect', () => {
        console.log('Socket connected (seller)', socket.id);
      });
      socket.on('connect_error', (err) => {
        console.warn('Socket connect error:', err && err.message ? err.message : err);
      });

      // optionally listen to listing related events
      socket.on('listing_reserved', (payload) => {
        console.log('listing_reserved:', payload);
        // If seller is notified about their listing, you may show a toast here.
      });

      socket.on('listing_confirmed', (payload) => {
        console.log('listing_confirmed:', payload);
      });

      socket.on('listing_updated', (payload) => {
        console.log('listing_updated:', payload);
      });

    } catch (e) {
      console.warn('Socket setup failed:', e);
    }
  }

  // Image preview helper — accepts comma separated URLs
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

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusText.innerText = 'Creating...';
    createBtn.disabled = true;

    // Basic validation
    const title = titleEl.value && titleEl.value.trim();
    if (!title) {
      statusText.innerText = 'Title is required';
      createBtn.disabled = false;
      return;
    }

    const payload = {
      title,
      author: authorEl.value && authorEl.value.trim(),
      condition: conditionEl.value,
      price: priceEl.value ? Number(priceEl.value) : 0,
      currency: currencyEl.value ? currencyEl.value.trim() : 'INR',
      images: (imagesEl.value || '').split(',').map(x => x.trim()).filter(Boolean),
      sellerContact: sellerContactEl.value ? sellerContactEl.value.trim() : undefined
    };

    try {
      const res = await authFetch(LISTING_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = (data && data.message) || (data && data.error) || 'Failed to create listing';
        statusText.innerText = `Error: ${message}`;
        createBtn.disabled = false;
        return;
      }

      // Success
      statusText.innerText = 'Listing created ✅';
      // optionally navigate to listings page:
      setTimeout(() => {
        // prefer client app routing — fallback open listings page
        window.location.href = window.LISTINGS_PAGE || '/html_files/listings.html';
      }, 800);

    } catch (err) {
      console.error('create listing error', err);
      statusText.innerText = 'Error creating listing (network)';
      createBtn.disabled = false;
    }
  });

  // On load: ensure user is authenticated and connect socket
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

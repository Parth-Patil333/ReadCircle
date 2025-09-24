// js_files/seller.js
// Seller: create listing page logic (paste into readcircle-frontend/js_files/seller.js)

(function () {
  // -------------------- Config --------------------
  const API_BASE = (typeof window !== 'undefined' && window.BASE_URL) ? window.BASE_URL : "https://readcircle.onrender.com/api";
  const LISTING_ENDPOINT = `${API_BASE.replace(/\/api\/?$/, '')}/api/booklisting`.replace(/\/\/api/, '/api');

  // -------------------- Small toast helper --------------------
  // If you already have a global toast, this will not conflict.
  function createToast(text, opts = {}) {
    try {
      // prefer global if provided
      if (typeof window.createToast === 'function') {
        return window.createToast(text, opts);
      }
    } catch (e) { }
    // local simple toast
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

  // -------------------- Auth helpers (safe, no TDZ) --------------------
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

    // If body is object (not FormData) stringify it and set Content-Type
    if (typeof options.body !== 'undefined' && !(options.body instanceof FormData)) {
      if (typeof options.body === 'object') {
        try { options.body = JSON.stringify(options.body); } catch (e) { /*ignore*/ }
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

  // seller.js — add this near the top (after authFetchFn is available)
  async function uploadImageToServer(file) {
    if (!file) throw new Error('No file provided');

    const fd = new FormData();
    fd.append('file', file);

    // authFetchFn will add Authorization; it won't set Content-Type for FormData — that's correct
    const res = await authFetchFn('/api/upload', { method: 'POST', body: fd });

    // parse JSON body
    const txt = await res.text();
    let body;
    try { body = JSON.parse(txt); } catch (e) { body = { raw: txt }; }

    if (!res.ok) {
      const message = body && body.message ? body.message : 'Upload failed';
      throw new Error(message);
    }
    // body.url is the Cloudinary secure url
    return body.url;
  }

  // small jwt parse used elsewhere
  function parseJwtSafe(token) {
    try {
      if (!token) return null;
      const b64 = token.split('.')[1];
      if (!b64) return null;
      const json = decodeURIComponent(atob(b64.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }
  function isTokenExpired(token) {
    const p = parseJwtSafe(token);
    if (!p || !p.exp) return true;
    return Date.now() >= p.exp * 1000;
  }

  // -------------------- DOM elements (defensive) --------------------
  const form = document.getElementById('createListingForm');
  if (!form) {
    console.info('seller.js: createListingForm not found — seller script not active on this page.');
    return;
  }
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

  // -------------------- Socket reuse --------------------
  function ensureSocket() {
    if (window.__rc_socket && typeof window.__rc_socket.on === 'function') {
      return window.__rc_socket;
    }
    if (typeof io !== 'function') {
      console.warn('seller.js: socket.io client not loaded; sockets disabled');
      return null;
    }
    const origin = window.SOCKET_URL || (API_BASE.replace(/\/api\/?$/, '')) || window.location.origin;
    const token = authGetToken();
    if (!token) return null;
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
      console.warn('seller.js: socket connection failed', e);
      return null;
    }
  }

  const socket = ensureSocket();
  if (socket) {
    socket.on('connect', () => console.log('Socket connected (seller)', socket.id));
    socket.on('connect_error', (err) => console.warn('Socket connect_error (seller)', err && err.message ? err.message : err));
  }

  // -------------------- Image preview & helpers --------------------
  function renderImagePreview() {
    if (!imagePreview) return;
    imagePreview.innerHTML = '';
    const raw = (imagesEl && imagesEl.value) ? imagesEl.value : '';
    const urls = raw.split(',').map(s => s.trim()).filter(Boolean);
    urls.forEach(u => {
      if (u.startsWith('data:')) {
        const warn = document.createElement('div');
        warn.style.color = '#b33';
        warn.textContent = 'Pasted image data is not allowed. Please provide hosted image URLs.';
        imagePreview.appendChild(warn);
        return;
      }
      const img = document.createElement('img');
      img.src = u;
      img.style.maxWidth = '120px';
      img.onerror = () => { img.style.opacity = '0.4'; };
      imagePreview.appendChild(img);
    });
  }
  if (imagesEl) imagesEl.addEventListener('input', renderImagePreview);
  renderImagePreview();

  // -------------------- Clear form --------------------
  if (clearBtn) clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    form.reset();
    if (imagePreview) imagePreview.innerHTML = '';
    if (statusText) statusText.innerText = '';
  });

  // -------------------- Submit handler --------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (createBtn) createBtn.disabled = true;
    if (statusText) statusText.innerText = 'Creating...';

    // client-side title check
    const title = titleEl && String(titleEl.value || '').trim();
    if (!title) {
      if (statusText) statusText.innerText = 'Error: title is required';
      if (createBtn) createBtn.disabled = false;
      return;
    }

    // --- handle image file upload if user selected a file input with id="imageFile"
    const inputFile = document.getElementById('imageFile');
    let finalImages = (imagesEl && imagesEl.value) ? imagesEl.value.split(',').map(x => x.trim()).filter(Boolean) : [];

    // If file was selected, upload it first and append returned URL
    if (inputFile && inputFile.files && inputFile.files[0]) {
      try {
        if (statusText) statusText.innerText = 'Uploading image...';
        const uploadedUrl = await uploadImageToServer(inputFile.files[0]); // may throw
        // append result to images
        if (uploadedUrl) finalImages.push(uploadedUrl);
      } catch (err) {
        console.error('Image upload failed', err);
        if (statusText) statusText.innerText = 'Image upload failed: ' + (err.message || err);
        if (createBtn) createBtn.disabled = false;
        return;
      }
    }

    // Continue with previous validation (filter out data URIs if any remain)
    finalImages = finalImages.filter(u => !u.startsWith('data:') && String(u).length <= 2000);

    // If user provided only bad images, stop
    if ((imagesEl && imagesEl.value) && finalImages.length === 0) {
      if (statusText) statusText.innerText = 'Error: please supply hosted image URLs or upload a file.';
      if (createBtn) createBtn.disabled = false;
      return;
    }

    // Build final payload
    const payload = {
      title,
      author: authorEl ? (authorEl.value || '').trim() : undefined,
      condition: conditionEl ? (conditionEl.value || '').trim() : undefined,
      price: priceEl ? (priceEl.value ? Number(priceEl.value) : 0) : 0,
      currency: currencyEl ? (currencyEl.value || '').trim() : 'INR',
      images: finalImages,
      sellerContact: sellerContactEl ? (sellerContactEl.value || '').trim() : undefined
    };

    // Debug log (safe)
    console.log('seller.js: sending create payload', payload);

    try {
      // Ensure authFetchFn sets Content-Type when body is object (our wrapper does)
      const res = await authFetchFn(LISTING_ENDPOINT, {
        method: 'POST',
        body: payload
      });

      const text = await res.text().catch(() => '');
      let body;
      try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }

      console.log('seller.js: create response', res.status, body);

      if (!res.ok) {
        const message = (body && body.message) || 'Failed to create listing';
        if (statusText) statusText.innerText = `Error: ${message}`;
        if (createBtn) createBtn.disabled = false;
        return;
      }

      // Success — DO NOT auto-redirect. Reset and show confirmation + optional link
      if (statusText) statusText.innerText = 'Listing created ✅';
      if (createBtn) createBtn.disabled = false;
      form.reset();
      if (imagePreview) imagePreview.innerHTML = '';

      createToast('Listing created — buyers will see it shortly', { timeout: 3500 });

      // show a small "View listings" link next to status (user may click manually)
      try {
        const linkId = 'rc_view_listings_link';
        let link = document.getElementById(linkId);
        if (!link && statusText) {
          link = document.createElement('a');
          link.id = linkId;
          link.href = window.LISTINGS_PAGE || 'listing.html';
          link.innerText = ' View listings';
          link.style.marginLeft = '10px';
          link.style.color = '#036';
          statusText.appendChild(link);
        }
      } catch (e) { /* ignore UI attach errors */ }

      // If socket exists we can optionally emit a lightweight client event for debug (server should broadcast real events)
      try {
        if (window.__rc_socket && typeof window.__rc_socket.emit === 'function') {
          // emit local helpful event for other clients if server doesn't push immediately
          // Note: server is authoritative and will broadcast real events; this is optional
          window.__rc_socket.emit('client:listing_created_ping', { title: payload.title });
        }
      } catch (e) { /* ignore emit errors */ }

    } catch (err) {
      console.error('seller.js: create network error', err);
      if (statusText) statusText.innerText = 'Network error while creating listing';
      if (createBtn) createBtn.disabled = false;
    }
  });

  // expose for debugging
  window.ReadCircleSeller = {
    createListingEndpoint: LISTING_ENDPOINT
  };

})();

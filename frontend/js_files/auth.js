// js_files/auth.js
// Global auth helpers — expose window.getToken, setToken, clearToken, authFetch, getUserId
(function () {
  // token storage keys order
  const STORAGE_KEYS = ['token', 'authToken', 'jwt', 'accessToken'];

  function setToken(token) {
    try {
      localStorage.setItem('token', token);
    } catch (e) {
      try { sessionStorage.setItem('token', token); } catch (e2) {}
    }
    return token;
  }

  function getToken() {
    try {
      for (const k of STORAGE_KEYS) {
        const v = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (v) return v;
      }
      // cookie fallback
      const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) {}
    return null;
  }

  function clearToken() {
    try {
      for (const k of STORAGE_KEYS) {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      }
      // also clear cookie (best-effort)
      document.cookie = 'token=; Max-Age=0; path=/';
    } catch (e) {}
  }

  function parseJwt(token) {
    try {
      if (!token) return null;
      const b64 = token.split('.')[1];
      if (!b64) return null;
      const json = decodeURIComponent(atob(b64.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function isTokenExpired(token) {
    const p = parseJwt(token);
    if (!p || !p.exp) return true;
    return Date.now() >= p.exp * 1000;
  }

  // normalizes id field names from token payload (id, _id, userId, sub)
  function getUserId() {
    const token = getToken();
    if (!token) return null;
    const p = parseJwt(token);
    if (!p) return null;
    return String(p.id || p._id || p.userId || p.sub || p._userId || '');
  }

  // wrapped fetch that attaches Bearer token when available and handles JSON bodies
  async function authFetch(url, options = {}) {
    const token = getToken();
    const opts = Object.assign({}, options);
    opts.headers = Object.assign({}, opts.headers || {});

    // Handle body encoding (skip FormData)
    if (typeof opts.body !== 'undefined' && !(opts.body instanceof FormData)) {
      if (typeof opts.body === 'object') {
        try { opts.body = JSON.stringify(opts.body); } catch (e) { /* leave as-is */ }
      }
      const hasCT = Object.keys(opts.headers).some(h => h.toLowerCase() === 'content-type');
      if (!hasCT && !(opts.body instanceof FormData)) {
        opts.headers['Content-Type'] = 'application/json';
      }
    }

    if (token && !isTokenExpired(token)) {
      opts.headers.Authorization = `Bearer ${token}`;
    }

    return fetch(url, opts);
  }

  // Expose to window with stable names other scripts expect
  try {
    window.setToken = setToken;
    window.getToken = getToken;
    window.clearToken = clearToken;
    window.parseJwt = parseJwt;
    window.isTokenExpired = isTokenExpired;
    window.authFetch = authFetch;
    window.getUserId = getUserId;
  } catch (e) {}

  // For module consumers attach named exports if environment supports
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { setToken, getToken, clearToken, parseJwt, isTokenExpired, authFetch, getUserId };
  }
})();

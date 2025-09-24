// auth.js (global helpers)

function setToken(token) {
  localStorage.setItem("token", token);
}
function getToken() {
  return localStorage.getItem("token");
}
function clearToken() {
  localStorage.removeItem("token");
}

function parseJwt(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(atob(b64).split("").map(c =>
      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
    ).join("")));
  } catch { return null; }
}

function isTokenExpired(token) {
  const p = parseJwt(token);
  if (!p || !p.exp) return true;
  return Date.now() >= p.exp * 1000; // exp is seconds
}

// ✅ Call at top of protected pages
function requireAuth() {
  const token = getToken();
  if (!token || isTokenExpired(token)) {
    clearToken();
    window.location.href = "login.html";
    return;
  }
  return token;
}

// ✅ Wrapper to auto-attach Authorization header and JSON content-type when needed
async function authFetch(url, options = {}) {
  const token = getToken();
  // make a shallow copy to avoid mutating caller's object
  const opts = Object.assign({}, options);
  opts.headers = Object.assign({}, opts.headers || {});

  // If there's a body and no Content-Type, assume JSON (but skip for FormData)
  if (typeof opts.body !== 'undefined') {
    // If body is an object, stringify it for JSON
    if (!(opts.body instanceof FormData) && typeof opts.body === 'object') {
      try {
        opts.body = JSON.stringify(opts.body);
      } catch (e) {
        // fallback: keep original body
      }
    }
    // If Content-Type header not present and body is not FormData, set JSON
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

// Optional convenience
function getUsername() {
  const p = parseJwt(getToken() || "");
  return p?.username || "";
}

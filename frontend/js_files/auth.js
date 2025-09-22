// auth.js (frontend helpers) — REPLACE your file with this

// storage key
const TOKEN_KEY = "token";

/* ===== storage helpers ===== */
function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    console.warn('[auth] setToken failed:', e);
  }
}
function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    console.warn('[auth] getToken failed:', e);
    return null;
  }
}
function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.warn('[auth] clearToken failed:', e);
  }
}

/* ===== JWT helpers ===== */
function _base64UrlToBase64(b64url = "") {
  // Convert base64url to base64
  b64url = b64url.replace(/-/g, "+").replace(/_/g, "/");
  // pad with '='
  while (b64url.length % 4) b64url += "=";
  return b64url;
}

function parseJwt(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = _base64UrlToBase64(parts[1]);
    // atob may throw; wrap it
    const json = atob(b64);
    try {
      // handle utf8
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
      // fallback to direct parse if decodeURIComponent/escape not needed
      return JSON.parse(json);
    }
  } catch (err) {
    console.warn("[auth] parseJwt failed:", err);
    return null;
  }
}

function isTokenExpired(token) {
  const p = parseJwt(token);
  if (!p || !p.exp) return true;
  return Date.now() >= p.exp * 1000;
}

/* ===== auth utilities ===== */
// Call this at the top of pages that require login
function requireAuth(redirectTo = "login.html") {
  const token = getToken();
  if (!token || isTokenExpired(token)) {
    clearToken();
    window.location.href = redirectTo;
    return null;
  }
  return token;
}

/* ===== fetch wrapper that auto-attaches Authorization ===== */
async function authFetch(url, options = {}) {
  // clone headers safely
  const headers = Object.assign({}, options.headers || {});

  // attach token if valid
  const token = getToken();
  if (token && !isTokenExpired(token)) {
    headers.Authorization = `Bearer ${token}`;
  }

  // if body is an object (not a string/FormData), stringify it and set content-type
  let body = options.body;
  const isFormData = (obj) =>
    typeof FormData !== "undefined" && obj instanceof FormData;
  if (body && typeof body === "object" && !isFormData(body) && !(body instanceof String)) {
    try {
      body = JSON.stringify(body);
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    } catch (err) {
      console.warn("[authFetch] failed to stringify body:", err);
      // fall through — body may be something else; let fetch handle it
    }
  }

  // assemble fetch options
  const fetchOpts = Object.assign({}, options, { headers, body });

  try {
    const resp = await fetch(url, fetchOpts);
    // don't swallow non-OK responses — allow caller to inspect resp.status, resp.json() etc.
    return resp;
  } catch (err) {
    // network or other fatal error
    console.error("[authFetch] network/error:", err);
    // rethrow so caller can catch and show UI error
    throw err;
  }
}

/* convenience */
function getUsername() {
  const p = parseJwt(getToken() || "");
  return p?.username || "";
}

/* expose in global scope as before */
window.setToken = setToken;
window.getToken = getToken;
window.clearToken = clearToken;
window.parseJwt = parseJwt;
window.isTokenExpired = isTokenExpired;
window.requireAuth = requireAuth;
window.authFetch = authFetch;
window.getUsername = getUsername;

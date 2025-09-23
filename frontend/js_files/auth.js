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

// ✅ Wrapper to auto-attach Authorization header
async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = Object.assign({}, options.headers || {});
  if (token && !isTokenExpired(token)) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

// Optional convenience
function getUsername() {
  const p = parseJwt(getToken() || "");
  return p?.username || "";
}

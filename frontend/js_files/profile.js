// profile.js - place in /assets/js/profile.js
// Assumes backend base (same as your other frontend files)
const BASE_URL = (typeof BASE_URL !== 'undefined') ? BASE_URL : "https://readcircle.onrender.com/api";

// Try common storage keys for token
function getAuthToken() {
  const keys = ['token', 'authToken', 'jwt', 'accessToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  // also check cookie (simple)
  const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

function setMsg(text, type = 'info') {
  const el = document.getElementById('msg');
  if (!el) return;
  el.textContent = text || '';
  if (type === 'error') el.style.color = '#f66';
  else if (type === 'success') el.style.color = '#137c74';
  else el.style.color = ''; // default
}

// redirect to login if no token
const token = getAuthToken();
if (!token) {
  // preserve return URL
  const returnTo = encodeURIComponent(window.location.pathname);
  window.location.href = `/login.html?returnTo=${returnTo}`;
}

// elements
const usernameEl = document.getElementById('username');
const nameEl = document.getElementById('name');
const emailEl = document.getElementById('email');
const bioEl = document.getElementById('bio');
const locationEl = document.getElementById('location');
const titlesCountEl = document.getElementById('titlesCount');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const logoutBtn = document.getElementById('logoutBtn');

let originalData = null;

async function fetchProfile() {
  setMsg('Loading profile...');
  try {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // handle unauthorized
    if (res.status === 401) {
      setMsg('Session expired. Redirecting to login...', 'error');
      setTimeout(() => window.location.href = '/login.html', 900);
      return;
    }

    // parse JSON safely
    let body;
    try {
      body = await res.json();
    } catch (e) {
      console.error('Invalid JSON response', e);
      setMsg('Server returned invalid response', 'error');
      return;
    }

    // server returned standardized error shape
    if (!body.success) {
      // validation errors
      if (body.code === 'VALIDATION_ERROR' && Array.isArray(body.errors)) {
        setMsg(body.errors.map(e => `${e.param}: ${e.msg}`).join('; '), 'error');
        return;
      }

      // other errors
      setMsg(body.message || 'Failed to load profile', 'error');
      return;
    }

    populateForm(body.data);
    originalData = body.data;
    setMsg('');
  } catch (err) {
    console.error(err);
    setMsg('Network error while loading profile', 'error');
  }
}

function populateForm(user) {
  usernameEl.value = user.username || '';
  nameEl.value = user.name || '';
  emailEl.value = user.email || '';
  bioEl.value = user.bio || '';
  locationEl.value = user.location || '';
  titlesCountEl.textContent = (user.stats && user.stats.titlesCount) || 0;
}

// save handler
saveBtn.addEventListener('click', async () => {
  setMsg('Saving...');
  saveBtn.disabled = true;

  const payload = {
    username: usernameEl.value.trim(),
    name: nameEl.value.trim(),
    email: emailEl.value.trim(),
    bio: bioEl.value.trim(),
    location: locationEl.value.trim()
  };

  try {
    const res = await fetch(`${BASE_URL}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    // handle unauthorized early
    if (res.status === 401) {
      setMsg('Session expired - please login again', 'error');
      setTimeout(() => window.location.href = '/login.html', 1500);
      return;
    }

    // parse JSON safely
    let body;
    try {
      body = await res.json();
    } catch (e) {
      console.error('Invalid JSON response', e);
      setMsg('Server returned invalid response', 'error');
      return;
    }

    // handle standardized validation error (express-validator)
    if (res.status === 400 && body.code === 'VALIDATION_ERROR' && Array.isArray(body.errors)) {
      setMsg(body.errors.map(e => `${e.param}: ${e.msg}`).join('; '), 'error');
      saveBtn.disabled = false;
      return;
    }

    // handle duplicate/conflict errors (username/email)
    if (res.status === 409) {
      // body.code might be USERNAME_TAKEN / EMAIL_TAKEN
      setMsg(body.message || 'Conflict: value already taken', 'error');
      saveBtn.disabled = false;
      return;
    }

    // generic non-success
    if (!body.success) {
      setMsg(body.message || 'Failed to update profile', 'error');
      saveBtn.disabled = false;
      return;
    }

    // success
    populateForm(body.data);
    originalData = body.data;
    setMsg('Profile updated', 'success');
  } catch (err) {
    console.error(err);
    setMsg('Network error while updating profile', 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

cancelBtn.addEventListener('click', () => {
  if (originalData) populateForm(originalData);
  setMsg('Changes reverted');
});

logoutBtn.addEventListener('click', () => {
  // remove common token keys and redirect
  const keys = ['token', 'authToken', 'jwt', 'accessToken'];
  keys.forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
  // remove cookie token (best-effort)
  document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
  window.location.href = '/login.html';
});

// initial load
fetchProfile();

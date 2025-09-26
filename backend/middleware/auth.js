// middleware/auth.js
// Auth middleware (improved & defensive)
// - Accepts token from Authorization header "Bearer <token>" OR cookie "token" OR query param "token"
// - Verifies token with process.env.JWT_SECRET
// - Ensures req.user is normalized to { id: "<string>", _id: "<string>", username?: "<string>", email?: "<string>" }
// - Emits helpful debug logs when DEBUG_AUTH === '1'

const jwt = require('jsonwebtoken');

function debug(...args) {
  if (process.env.DEBUG_AUTH === '1') {
    try { console.debug('[auth]', ...args); } catch (e) {}
  }
}

module.exports = function (req, res, next) {
  try {
    // 1. Extract token from Authorization header or cookie or query
    let token = null;
    const authHeader = req.header('Authorization') || req.header('authorization');
    if (authHeader && typeof authHeader === 'string' && authHeader.trim()) {
      // support "Bearer <token>" or raw token
      const maybe = authHeader.trim();
      token = (maybe.match(/^Bearer\s+(.+)$/i) || [null, maybe])[1];
    }

    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token && req.query && req.query.token) {
      // keep this as a debugging fallback; prefer header/cookie in production
      token = req.query.token;
    }

    if (!token) {
      debug('no token provided');
      return res.status(401).json({ message: 'No token provided' });
    }

    const secret = process.env.JWT_SECRET || '<REDACTED_JWT_SECRET>';
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      debug('token verify failed:', err && err.message ? err.message : err);
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Normalize payload -> req.user
    const user = {};

    // Common shapes: { id }, { _id }, { userId }, or nested { user: { id/_id/userId } }
    if (payload && typeof payload === 'object') {
      // direct id/_id/userId
      if (payload.id) user.id = String(payload.id);
      if (payload._id && !user.id) user.id = String(payload._id);
      if (!user.id && payload.userId) user.id = String(payload.userId);

      // nested user
      if (!user.id && payload.user && typeof payload.user === 'object') {
        const nested = payload.user;
        user.id = String(nested.id || nested._id || nested.userId || '');
      }

      // copy common fields if present
      if (payload.username) user.username = payload.username;
      if (payload.name) user.name = payload.name;
      if (payload.email) user.email = payload.email;
    }

    // final sanity: if still no id, try to infer from any plausible field
    if (!user.id) {
      const possible = payload && typeof payload === 'object' ? (payload.id || payload._id || payload.userId || null) : null;
      if (possible) user.id = String(possible);
    }

    if (!user.id) {
      console.error('auth: token payload missing user id fields:', payload);
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    // set compatibility fields
    user._id = user.id;

    // attach to req
    req.user = user;

    debug('auth success for user', user.id);

    return next();
  } catch (err) {
    console.error('auth middleware unexpected error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error in auth' });
  }
};

// utils/jwt.js
// Centralized JWT helper — ensure tokens always include `id` claim.
// Usage:
//   const jwtUtil = require('../utils/jwt');
//   const token = jwtUtil.signToken(user);            // user can be mongoose doc or { _id, id, username, email }
//   const payload = jwtUtil.verifyToken(token);       // throws on invalid/expired

const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRY = '7d'; // change as needed

function _getSecret() {
  if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim() === '') {
    console.warn('WARNING: JWT_SECRET not set — using inline fallback (not safe for production)');
    return '<REDACTED_JWT_SECRET>';
  }
  return String(process.env.JWT_SECRET);
}

/**
 * Normalize a user-like object into the token payload.
 * Ensures `id` exists (string) and copies common safe fields.
 */
function _payloadFromUser(user = {}) {
  const payload = {};
  // prefer explicit id/_id/userId
  const rawId = user.id || user._id || user.userId || (user && user.toString && user.toString() === '[object Object]' ? undefined : undefined);
  if (rawId) payload.id = String(rawId);
  // sometimes user param is a mongoose doc with _id nested
  if (!payload.id && user && user._id) payload.id = String(user._id);

  // copy non-sensitive fields if present
  if (user.username) payload.username = String(user.username);
  if (user.email) payload.email = String(user.email);
  if (user.name) payload.name = String(user.name);

  return payload;
}

/**
 * Sign a JWT token.
 * - `user` may be an object or mongoose doc. Must contain an id or _id.
 * - `opts` may include `expiresIn` (string like '7d' or seconds).
 */
function signToken(user, opts = {}) {
  const secret = _getSecret();
  if (!user) throw new Error('signToken: user is required');

  const payload = _payloadFromUser(user);
  if (!payload.id) {
    // defensive: if caller passed a raw id
    if (typeof user === 'string' || typeof user === 'number') {
      payload.id = String(user);
    } else {
      throw new Error('signToken: unable to determine user id from provided value');
    }
  }

  const signOpts = { expiresIn: opts.expiresIn || DEFAULT_EXPIRY, ...(opts.jwtOptions || {}) };
  return jwt.sign(payload, secret, signOpts);
}

/**
 * Verify a JWT token. Returns decoded payload or throws.
 * Accepts raw token string (with or without "Bearer " prefix).
 */
function verifyToken(token) {
  if (!token) throw new Error('verifyToken: token required');
  const raw = String(token).replace(/^Bearer\s+/i, '').trim();
  const secret = _getSecret();
  return jwt.verify(raw, secret);
}

/**
 * Safe verify that returns null instead of throwing (convenience).
 */
function tryVerify(token) {
  try {
    return verifyToken(token);
  } catch (err) {
    return null;
  }
}

module.exports = {
  signToken,
  verifyToken,
  tryVerify
};

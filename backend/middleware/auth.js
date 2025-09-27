// middleware/auth.js
const jwt = require("jsonwebtoken");

/**
 * Auth middleware
 * - Accepts token from Authorization header "Bearer <token>" OR cookie "token"
 * - Verifies token with process.env.JWT_SECRET
 * - Normalizes req.user to always contain:
 *    { id: "<string>", _id: "<string>", username?: "<string>", email?: "<string>" }
 *
 * If token is invalid or missing, responds 401.
 *
 * NOTE: ensure process.env.JWT_SECRET is set in your environment.
 */

module.exports = function (req, res, next) {
  try {
    // 1. Extract token from Authorization header or cookie
    let token = null;
    const authHeader = req.header("Authorization") || req.header("authorization");
    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "").trim();
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.query && req.query.token) {
      // fallback: allow token in query param for debugging (optional)
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const secret = process.env.JWT_SECRET || "<REDACTED_JWT_SECRET>";
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      console.error("auth: token verify failed:", err.message);
      return res.status(401).json({ message: "Invalid token" });
    }

    // Normalize payload -> req.user
    // Support common shapes: { id }, { _id }, { userId }, or full user object
    const user = {};
    if (payload.id) user.id = String(payload.id);
    if (payload._id) user.id = String(payload._id);
    if (!user.id && payload.userId) user.id = String(payload.userId);
    if (!user.id && payload.user) {
      // payload.user might be nested user object
      user.id = String(payload.user.id || payload.user._id || payload.user.userId || "");
    }

    // If still no id, but payload contains username/email, still attach payload (best-effort)
    if (!user.id && (payload.username || payload.email)) {
      // Some projects encode the whole user object in token
      user.id = payload.id || payload._id || payload.userId || "";
    }

    // copy common fields if present
    if (payload.username) user.username = payload.username;
    if (payload.email) user.email = payload.email;
    if (payload.name) user.name = payload.name;

    // As a last resort, if payload is an object with many fields, attach it as raw
    if (!user.id && typeof payload === "object") {
      // attach minimal representation to avoid breaking controllers
      if (payload.id || payload._id || payload.userId) {
        user.id = String(payload.id || payload._id || payload.userId);
      } else {
        // No id at all — log and reject
        console.error("auth: token payload missing user id fields:", payload);
        return res.status(401).json({ message: "Invalid token payload" });
      }
    }

    // also set _id for compatibility
    user._id = user.id;

    // attach to req
    req.user = user;

    next();
  } catch (err) {
    console.error("auth middleware unexpected error:", err);
    return res.status(500).json({ message: "Server error in auth" });
  }
};

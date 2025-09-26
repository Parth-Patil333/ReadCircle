// server.js
// 🚀 ReadCircle backend (updated)
// - Improved CORS config (env-controlled)
// - Socket.IO handshake: accepts id / _id / userId fallback
// - Keeps global.__io and app.set('io') behavior for backward compatibility

if (process.env.DEBUG_URL) {
  process.env.DEBUG_URL = "";
}

const express = require('express');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const connectDB = require('./config/db');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// -------------------- CORS (env-configurable) --------------------
// Set ALLOWED_ORIGINS in env as comma-separated list, or use defaults below.
// Use '*' to allow all origins (not recommended for production).
const DEFAULT_ALLOWED = [
  'https://readcircle.netlify.app',
  'http://localhost:3000',
  'http://localhost:5500'
];

let allowedOrigins = DEFAULT_ALLOWED;
if (process.env.ALLOWED_ORIGINS) {
  // trim and split, ignore empty entries
  const envList = String(process.env.ALLOWED_ORIGINS).split(',').map(s => s.trim()).filter(Boolean);
  if (envList.length > 0) allowedOrigins = envList;
}

const allowAllOrigins = allowedOrigins.includes('*');

function corsOriginChecker(origin, callback) {
  // allow requests with no origin (curl, mobile apps, server-to-server)
  if (!origin) return callback(null, true);
  if (allowAllOrigins) return callback(null, true);
  // exact match check
  if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);

  // allow netlify preview subdomains optionally if configured
  // e.g. when ALLOW_NETLIFY_PREVIEWS === '1', allow any *.netlify.app
  if (process.env.ALLOW_NETLIFY_PREVIEWS === '1' && origin.endsWith('.netlify.app')) {
    return callback(null, true);
  }

  const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
  return callback(new Error(msg), false);
}

app.use(cors({
  origin: corsOriginChecker,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
}));
app.options('*', cors());

// -------------------- Middlewares --------------------
app.use(express.json());

// -------------------- Socket.IO setup --------------------
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Mirror HTTP CORS behavior for sockets
      if (!origin) return callback(null, true);
      if (allowAllOrigins) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      if (process.env.ALLOW_NETLIFY_PREVIEWS === '1' && origin.endsWith('.netlify.app')) return callback(null, true);
      return callback(new Error('Socket CORS: origin not allowed'), false);
    },
    methods: ["GET", "POST"]
  }
});

// attach io instance to app so controllers can access with req.app.get('io')
app.set('io', io);

// make io available globally so services can emit notifications
global.__io = io;

// -------------------- Socket auth middleware: expects token in handshake.auth.token
io.use((socket, next) => {
  try {
    const raw = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!raw) return next(new Error('Authentication error: token required'));
    const token = String(raw).replace(/^Bearer\s+/i, '').trim();
    if (!token) return next(new Error('Authentication error: token required'));

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error('socket auth: token verify failed:', err && err.message ? err.message : err);
      return next(new Error('Authentication error'));
    }

    // Accept multiple token shapes: { id }, { _id }, { userId }
    const uid = decoded?.id || decoded?._id || decoded?.userId || null;
    if (!uid) {
      // best-effort: if decoded contains nested user object
      const nested = decoded?.user || null;
      const nestedUid = nested?.id || nested?._id || nested?.userId || null;
      if (nestedUid) {
        socket.userId = String(nestedUid);
      } else {
        console.error('socket auth: token payload missing user id fields:', decoded);
        return next(new Error('Authentication error'));
      }
    } else {
      socket.userId = String(uid);
    }

    // attach raw user payload too (for convenience)
    socket.user = decoded;
    return next();
  } catch (err) {
    console.error('socket auth unexpected error:', err && err.message ? err.message : err);
    return next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const uid = String(socket.userId || socket.user?.id || '');
  if (uid) {
    // Keep backward compatibility for existing code that used raw uid rooms
    socket.join(uid);

    // New convention for notify helper
    socket.join(`user_${uid}`);

    // Shared room for listing updates / new-listing events
    socket.join('listings');

    console.log(`Socket connected: ${socket.id} (user ${uid}) -> joined rooms: ${uid}, user_${uid}, listings`);
  } else {
    // allow unauthenticated viewers to receive public listing broadcasts
    socket.join('listings');
    console.log(`Socket connected: ${socket.id} (no user id) -> joined listings`);
  }

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
});

// -------------------- Routes --------------------
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/books', require('./routes/bookRoutes'));
app.use('/api/journal', require('./routes/journalRoutes'));
app.use('/api/habits', require('./routes/habitRoutes'));
app.use('/api/lending', require('./routes/lendingRoutes'));
app.use('/api/dashboard/my-lendings', require('./routes/dashboardRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/booklisting', require('./routes/booklistingRoutes'));
app.use('/api/test', require('./routes/testRoutes')); // optional
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/upload', require('./routes/upload'));

// -------------------- DB, Cron, Health --------------------
connectDB();

// Cron jobs
try {
  const cleanup = require('./cron/cleanup');
  if (cleanup && typeof cleanup.start === 'function') {
    cleanup.start();
  } else {
    console.warn('cleanup job loaded but start() not found');
  }
} catch (e) {
  console.warn('Cleanup job not started:', e && e.message ? e.message : e);
}

// Health check
app.get('/', (req, res) => {
  res.send('ReadCircle Backend is running...');
});

// -------------------- Error handler (standardized JSON) --------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.message ? err.message : err);

  if (res.headersSent) return next(err);

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    code: err.code || undefined
  });
});

// -------------------- Start server --------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server + Socket.IO running on port ${PORT}`);
});

// start Day-24 background job (due date checker)
try { require("./jobs/duedateChecker").startScheduler(); } catch (e) { /* job not found; skipping scheduler start */ }

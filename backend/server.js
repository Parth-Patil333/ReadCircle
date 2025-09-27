// server.js
// 🚀 Prevent Render's DEBUG_URL issue at the very top
if (process.env.DEBUG_URL) {
  process.env.DEBUG_URL = ""; // Make it safe
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

// -------------------- CORS --------------------
// Allow your Netlify frontend and localhost (for development).
// If you host frontend elsewhere, add the origin there or use an env var.
const allowedOrigins = [
  'https://readcircle.netlify.app',
  'http://localhost:3000',
  'http://localhost:5500'
];
app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin (e.g. mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
}));
app.options('*', cors());

// -------------------- Middlewares --------------------
app.use(express.json());

// -------------------- Socket.IO setup --------------------
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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
    const token = String(raw).replace(/^Bearer\s+/i, '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // store minimal info on socket
    socket.userId = decoded.id;
    // optionally store username/email if present in token
    socket.user = decoded;
    return next();
  } catch (err) {
    return next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const uid = String(socket.userId || socket.user?.id || '');
  if (uid) {
    // Keep backward compatibility for existing code that used raw uid rooms
    socket.join(uid);               // existing lending code expects this

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
// Note: I moved notification routes to /api/notifications to avoid overlapping mounts.
// If you prefer a different path, adjust accordingly.
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
    // fallback: if module exported nothing, ignore
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

  // If headers already sent, delegate to default express handler
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    // optional error code for programmatic handling by frontend
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

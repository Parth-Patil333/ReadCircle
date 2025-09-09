// server.js
// 🚀 Prevent Render's DEBUG_URL issue at the very top
if (process.env.DEBUG_URL) {
  process.env.DEBUG_URL = ""; // Make it safe
}

const express = require('express');
require('dotenv').config();

const connectDB = require('./config/db');
const cors = require('cors');
const app = express();

app.use(express.json());

// ✅ Fix CORS
app.use(cors({
  origin: "https://readcircle.netlify.app", // your frontend on Netlify
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));
app.options('*', cors());

// ✅ Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/books', require('./routes/bookRoutes'));
app.use('/api/journal', require('./routes/journalRoutes'));
app.use('/api/habits', require('./routes/habitRoutes'));
app.use('/api/lending', require('./routes/lendingRoutes'));
app.use('/api/lending', require('./routes/notificationRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/booklisting', require('./routes/booklistingRoutes'));
app.use('/api/test', require('./routes/testRoutes')); // optional

// ✅ Connect DB
connectDB();

// ✅ Cron Jobs
require("./cron/cleanup");

// ✅ Health check
app.get('/', (req, res) => {
  res.send('ReadCircle Backend is running...');
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

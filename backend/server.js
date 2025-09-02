const express = require('express');
require('dotenv').config();

// 🚑 Render sets DEBUG_URL automatically, which breaks path-to-regexp
if (process.env.DEBUG_URL) {
  delete process.env.DEBUG_URL;
}

const connectDB = require('./config/db');
const cors = require('cors');
const app = express();

app.use(express.json());

// ✅ Fix CORS
app.use(cors({
  origin: "https://readcircle.netlify.app",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));
app.options('*', cors());

// ✅ Correct routes
app.use('/api/auth', require('./routes/authRoute')); 
app.use('/api/books', require('./routes/bookRoutes'));
app.use('/api/journal', require('./routes/journalRoutes'));
app.use('/api/habits', require('./routes/habitRoutes'));
app.use('/api/lending', require('./routes/lendingRoutes'));
app.use('/api/booklisting', require('./routes/booklistingRoute'));
app.use('/api/test', require('./routes/testRoute')); // optional

// Connect to MongoDB
connectDB();

// Load cron jobs
require("./cron/cleanup");

// Test route
app.get('/', (req, res) => {
  res.send('ReadCircle Backend is running...');
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

const express = require('express');
require('dotenv').config();
const connectDB = require('./config/db'); // <-- Added
const cors = require('cors');
const app = express();

app.use(express.json());

// After app.use(express.json());
// app.use('/api/test', require('./routes/testRoutes'));
app.use(cors());

app.use('/api/auth', require('./routes/authRoutes'));


// Connect to MongoDB
connectDB();

// Test route
app.get('/', (req, res) => {
  res.send('ReadCircle Backend is running...');
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

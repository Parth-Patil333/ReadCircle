const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String },
  status: { 
    type: String, 
    enum: ['To Read', 'Reading', 'Finished'], 
    default: 'To Read' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Book', bookSchema);

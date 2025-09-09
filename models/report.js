const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  area: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  // 👉 NEW optional coordinates
  lat: { type: Number },
  lng: { type: Number },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Report', ReportSchema);

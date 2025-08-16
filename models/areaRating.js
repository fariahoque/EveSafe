// models/areaRating.js
const mongoose = require('mongoose');

const areaRatingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  area:   { type: String, required: true, trim: true },
  score:  { type: Number, required: true, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now }
});

// One rating per user per area per day (prevents spam)
areaRatingSchema.index(
  { userId: 1, area: 1, createdAt: 1 },
  {
    partialFilterExpression: { createdAt: { $exists: true } }
  }
);

module.exports = mongoose.model('AreaRating', areaRatingSchema);

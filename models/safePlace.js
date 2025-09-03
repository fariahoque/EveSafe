const mongoose = require('mongoose');

const safePlaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  area: { type: String, required: true, trim: true },
  lat:  { type: Number, required: true },
  lng:  { type: Number, required: true },
  description: { type: String, trim: true },
  suggestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

safePlaceSchema.index({ area: 1, approved: 1 });

module.exports = mongoose.model('SafePlace', safePlaceSchema);

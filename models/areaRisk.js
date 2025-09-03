// models/areaRisk.js
const mongoose = require('mongoose');

const areaRiskSchema = new mongoose.Schema({
  area: { type: String, required: true, index: true },
  recentReports: { type: Number, default: 0 },
  avgRating: { type: Number, default: 0 },
  risk: { type: Number, default: 0 },         // 0–100
  level: { type: String, enum: ['low', 'moderate', 'high'], default: 'low' },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

areaRiskSchema.index({ area: 1 }, { unique: true });

module.exports = mongoose.model('AreaRisk', areaRiskSchema);

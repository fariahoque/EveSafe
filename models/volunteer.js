// models/volunteer.js
const mongoose = require('mongoose');

const volunteerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // the user who applied
  area:   { type: String, required: true, trim: true },                           // volunteer’s area
  verified: { type: Boolean, default: false },                                    // admin approval
  createdAt: { type: Date, default: Date.now }
});

// Ensure one volunteer record per user
volunteerSchema.index({ userId: 1 }, { unique: true });

// Fast lookups for “email all verified volunteers in area”
volunteerSchema.index({ area: 1, verified: 1 });

module.exports = mongoose.model('Volunteer', volunteerSchema);

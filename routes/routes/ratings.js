// routes/ratings.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const AreaRating = require('../models/areaRating');

// Auth gate
function ensureAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
}

// Helper: robust userId (works even if _id missing in session)
async function getUserId(req) {
  if (req.session?.user?._id) return req.session.user._id;
  const email = req.session?.user?.email;
  if (!email) return null;
  const doc = await mongoose.connection.collection('users').findOne({ email });
  if (doc?._id) {
    req.session.user._id = doc._id;
    return doc._id;
  }
  return null;
}

// Submit or update today's rating for an area
router.post('/', ensureAuth, async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.redirect('/login');

  const { area } = req.body;
  const s = Math.max(1, Math.min(5, Number(req.body.score || 0)));

  // Upsert today's rating (by day boundary)
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date();   end.setHours(23, 59, 59, 999);

  await AreaRating.findOneAndUpdate(
    { userId, area, createdAt: { $gte: start, $lte: end } },
    { $set: { score: s, area }, $setOnInsert: { userId } },
    { upsert: true, new: true }
  );

  // Return to the area reports page
  return res.redirect('/my-area-reports');
});

// Average rating API (used by the page to display avg)
router.get('/avg', ensureAuth, async (req, res) => {
  const area = (req.query.area || '').trim();
  if (!area) return res.json({ area: '', avg: null, count: 0 });

  const agg = await AreaRating.aggregate([
    { $match: { area } },
    { $group: { _id: '$area', avg: { $avg: '$score' }, count: { $sum: 1 } } }
  ]);

  if (!agg.length) return res.json({ area, avg: null, count: 0 });
  res.json({ area, avg: Number(agg[0].avg.toFixed(2)), count: agg[0].count });
});

module.exports = router;

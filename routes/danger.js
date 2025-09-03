// routes/danger.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

function ensureAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
}

async function computeAreaRisk(area) {
  const db = mongoose.connection;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7*24*60*60*1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30*24*60*60*1000);

  const recentReports = await db.collection('reports').countDocuments({
    area, createdAt: { $gte: sevenDaysAgo }
  });

  const ratingAgg = await db.collection('arearatings').aggregate([
    { $match: { area, createdAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: null, avg: { $avg: '$score' }, n: { $sum: 1 } } }
  ]).toArray();

  const avgRating = ratingAgg[0]?.avg ?? 5;

  let risk = Math.min(100, recentReports * 10 + (5 - avgRating) * 12);
  risk = Math.round(risk);

  let level = 'low';
  if (risk >= 60) level = 'high';
  else if (risk >= 40) level = 'moderate';

  return { area, recentReports, avgRating: Number(avgRating.toFixed(2)), risk, level };
}

// GET /danger/area?name=<area>
router.get('/area', ensureAuth, async (req, res) => {
  try {
    const area = (req.query.name || req.session.user?.area || '').trim();
    if (!area) return res.status(400).json({ error: 'area required' });

    const result = await computeAreaRisk(area);
    return res.json(result);
  } catch (e) {
    console.error('[danger] failed:', e);
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;

// lib/risk.js
const mongoose = require('mongoose');

async function computeAreaRisk(area) {
  const db = mongoose.connection;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1) recent reports (last 7 days)
  const recentReports = await db.collection('reports').countDocuments({
    area,
    createdAt: { $gte: sevenDaysAgo }
  });

  // 2) average rating (last 30 days)
  const ratingAgg = await db.collection('arearatings').aggregate([
    { $match: { area, createdAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: null, avg: { $avg: '$score' }, n: { $sum: 1 } } }
  ]).toArray();

  const avgRating = ratingAgg[0]?.avg ?? 5;

  // 3) risk formula (tweak any time)
  let risk = Math.min(100, recentReports * 10 + (5 - avgRating) * 12);
  risk = Math.round(risk);

  let level = 'low';
  if (risk >= 60) level = 'high';
  else if (risk >= 40) level = 'moderate';

  return {
    area,
    recentReports,
    avgRating: Number(avgRating.toFixed(2)),
    risk,
    level
  };
}

module.exports = { computeAreaRisk };

// routes/route.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));


function ensureAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}


/**
 * GET /api/route/safe?from=lng,lat&to=lng,lat&profile=driving&alternatives=1
 * Returns: { geojson, distance, riskScore, riskLevel }
 */
router.get('/safe', ensureAuth, async (req, res) => {
  try {
    const [flng, flat] = (req.query.from || '').split(',').map(Number);
    const [tlng, tlat] = (req.query.to   || '').split(',').map(Number);
    const profile = (req.query.profile || 'driving'); // driving/foot/bicycle
    const wantAlts = String(req.query.alternatives || '1') === '1'; // ask for alternatives

    if (![flng, flat, tlng, tlat].every(Number.isFinite)) {
      return res.status(400).json({ error: 'Bad coordinates' });
    }

    // 1) Ask OSRM for route(s)
    const osrmUrl =
      `https://router.project-osrm.org/route/v1/${profile}/${flng},${flat};${tlng},${tlat}` +
      `?overview=full&geometries=geojson${wantAlts ? '&alternatives=true' : ''}`;
    const r = await fetch(osrmUrl);
    if (!r.ok) return res.status(502).json({ error: 'Routing failed' });
    const js = await r.json();
    const routes = js.routes || [];
    if (!routes.length) return res.status(404).json({ error: 'No route' });

    // 2) Score each route’s risk using your DB (reports last 7d, ratings last 30d)
    const scored = [];
    for (const route of routes.slice(0, 3)) { // cap to 3
      const { riskScore, riskLevel } = await scoreRouteRisk(route.geometry);
      scored.push({ route, riskScore, riskLevel });
    }

    // 3) Pick the safest (lowest score)
    scored.sort((a, b) => a.riskScore - b.riskScore);
    const best = scored[0];
    const geojson = {
      type: 'Feature',
      geometry: best.route.geometry, // GeoJSON LineString
      properties: { riskScore: best.riskScore, riskLevel: best.riskLevel }
    };

    res.json({
      geojson,
      distance: best.route.distance,
      riskScore: best.riskScore,
      riskLevel: best.riskLevel
    });
  } catch (e) {
    console.error('[route.safe] error:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

// ---- helpers ----

async function scoreRouteRisk(geometry) {
  // sample points along the route (every ~200m by skipping coordinates)
  const coords = geometry.coordinates; // [lng,lat]
  const sampled = [];
  const step = Math.max(1, Math.floor(coords.length / 50)); // ~50 samples max
  for (let i = 0; i < coords.length; i += step) sampled.push(coords[i]);

  const db = mongoose.connection;
  const now = new Date();
  const ago7  = new Date(now.getTime() - 7  * 24 * 3600 * 1000);
  const ago30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  // ~300m box around each sample point (Dhaka lat)
  const BOX = 0.003;

  let total = 0, n = 0;
  for (const [lng, lat] of sampled) {
    // recent reports
    const reports = await db.collection('reports').countDocuments({
      createdAt: { $gte: ago7 },
      lat: { $gte: lat - BOX, $lte: lat + BOX },
      lng: { $gte: lng - BOX, $lte: lng + BOX }
    });

    // average rating
    const agg = await db.collection('arearatings').aggregate([
      { $match: {
          createdAt: { $gte: ago30 },
          lat: { $gte: lat - BOX, $lte: lat + BOX },
          lng: { $gte: lng - BOX, $lte: lng + BOX }
        }
      },
      { $group: { _id: null, avg: { $avg: '$score' } } }
    ]).toArray();
    const avg = agg[0]?.avg ?? 5;

    // same formula you’re using for areas
    const score = Math.min(100, reports * 10 + (5 - avg) * 12);
    total += score; n++;
  }

  const riskScore = n ? Math.round(total / n) : 0;
  const riskLevel = riskScore >= 60 ? 'high' : riskScore >= 40 ? 'moderate' : 'low';
  return { riskScore, riskLevel };
}

module.exports = router;

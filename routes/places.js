// routes/places.js
const express = require('express');
const router = express.Router();
const SafePlace = require('../models/safePlace');

// Parse bodies on this router (important for req.body)
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

// ---- helpers ----
function ensureAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.email !== 'admin@evesafe.com') {
    return res.status(403).send('Access denied');
  }
  next();
}

// Fallback centers if user didn't provide lat/lng
const AREA_CENTER = {
  Banasree:  [23.7639, 90.4294],
  Bashabo:   [23.7416, 90.4218],
  Dhanmondi: [23.7465, 90.3760],
  Gulshan:   [23.7925, 90.4078],
  Banani:    [23.7936, 90.4043],
  Mirpur:    [23.8223, 90.3654],
  Uttara:    [23.8747, 90.3984],
  Motijheel: [23.7324, 90.4178],
};

// quick sanity check
router.get('/ping', (_req, res) => res.type('text').send('places ok'));

// Public page (works with or without login)
router.get('/', (req, res) => {
  res.render('places', {
    title: 'Safe Check-in Points',
    user: req.session?.user || { area: '' }
  });
});

// Public read-only API of approved places
// /places/api?area=Banasree  (area optional)
router.get('/api', async (req, res) => {
  const q = { approved: true };
  if (req.query.area) q.area = req.query.area;
  const places = await SafePlace.find(q).sort({ createdAt: -1 }).lean();
  res.json({ ok: true, places });
});

// Suggest a new place (no login required; records user if present)
router.post('/suggest', async (req, res) => {
  try {
    const { name, area, lat, lng, description } = req.body || {};
    if (!name || !area) {
      console.log('Bad suggest payload:', req.body);
      return res.status(400).send('Missing required fields');
    }

    // parse or fall back to area center
    let latNum = parseFloat(lat);
    let lngNum = parseFloat(lng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      const center = AREA_CENTER[area];
      if (!center) {
        return res
          .status(400)
          .send('Please click "Use my location" or choose a known area.');
      }
      [latNum, lngNum] = center;
    }

    await SafePlace.create({
      name,
      area,
      lat: latNum,
      lng: lngNum,
      description: description || '',
      suggestedBy: req.session?.user?._id || null,
      approved: false,
    });

    return res.redirect('/places?suggested=1');
  } catch (e) {
    console.error('suggest place failed:', e);
    return res.status(500).send('Failed to submit place');
  }
});

// Admin: pending approvals & approved list
router.get('/admin', ensureAdmin, async (req, res) => {
  const pending = await SafePlace.find({ approved: false }).sort({ createdAt: -1 }).lean();
  const approved = await SafePlace.find({ approved: true }).sort({ createdAt: -1 }).lean();
  res.render('admin-places', {
    title: 'Admin · Safe Places',
    user: req.session.user,
    pending,
    approved,
  });
});

router.post('/admin/approve/:id', ensureAdmin, async (req, res) => {
  await SafePlace.findByIdAndUpdate(req.params.id, { approved: true });
  res.redirect('/places/admin');
});

router.post('/admin/delete/:id', ensureAdmin, async (req, res) => {
  await SafePlace.findByIdAndDelete(req.params.id);
  res.redirect('/places/admin');
});

module.exports = router;

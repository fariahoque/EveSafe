// routes/volunteers.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Volunteer = require('../models/volunteer');

// Auth guard
function ensureAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
}

// Helper: get userId even if session._id is missing
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

/* -------------------- User pages -------------------- */

// View my volunteer status + apply/cancel form
router.get('/', ensureAuth, async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.redirect('/login');

  const me = await Volunteer.findOne({ userId });
  res.render('volunteers', {
    title: 'Volunteer Network',
    me,
    user: req.session.user
  });
});

// Apply (or update) as a volunteer for my area
router.post('/apply', ensureAuth, async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.redirect('/login');

  const area = req.session.user.area; // user’s area from session
  await Volunteer.findOneAndUpdate(
    { userId },
    { $set: { area, verified: false } },
    { upsert: true, new: true }
  );

  res.redirect('/volunteers');
});

// Cancel my volunteer status
router.post('/cancel', ensureAuth, async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.redirect('/login');

  await Volunteer.deleteOne({ userId });
  res.redirect('/volunteers');
});

/* -------------------- Admin pages -------------------- */

// List all volunteers (admin only)
router.get('/admin', ensureAuth, async (req, res) => {
  if (req.session.user.email !== 'admin@evesafe.com') return res.status(403).send('Admins only');

  const volunteers = await Volunteer.find({}).sort({ createdAt: -1 }).lean();

  // join with users collection to show name/email
  const ids = volunteers.map(v => v.userId);
  const users = await mongoose.connection.collection('users')
    .find({ _id: { $in: ids } })
    .project({ email: 1, name: 1 })
    .toArray();

  const byId = new Map(users.map(u => [String(u._id), u]));
  const rows = volunteers.map(v => ({
    _id: String(v._id),
    area: v.area,
    verified: !!v.verified,
    userId: String(v.userId),
    email: byId.get(String(v.userId))?.email || '(unknown)',
    name: byId.get(String(v.userId))?.name || '(unknown)',
    createdAt: v.createdAt
  }));

  res.render('admin-volunteers', {
    title: 'Volunteers',
    rows,
    user: req.session.user
  });
});

// Verify / Unverify actions
router.post('/admin/:id/verify', ensureAuth, async (req, res) => {
  if (req.session.user.email !== 'admin@evesafe.com') return res.status(403).send('Admins only');
  await Volunteer.findByIdAndUpdate(req.params.id, { verified: true });
  res.redirect('/volunteers/admin');
});

router.post('/admin/:id/unverify', ensureAuth, async (req, res) => {
  if (req.session.user.email !== 'admin@evesafe.com') return res.status(403).send('Admins only');
  await Volunteer.findByIdAndUpdate(req.params.id, { verified: false });
  res.redirect('/volunteers/admin');
});
module.exports = router;

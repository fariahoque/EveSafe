// routes/checkin.js
const express = require('express');
const router = express.Router();
const Checkin = require('../models/checkin');
const mongoose = require('mongoose'); // ✅ for direct collection lookup

// Require login for all checkin pages
function ensureAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
}

// Helper: get a reliable userId (from session or DB by email)
async function getUserIdFromSession(req) {
  // Already have it?
  if (req.session?.user?._id) return req.session.user._id;

  // Fallback: find user by email in DB and cache _id back to session
  const email = req.session?.user?.email;
  if (!email) return null;

  const doc = await mongoose.connection
    .collection('users') // assumes your users collection is named 'users'
    .findOne({ email });

  if (doc && doc._id) {
    req.session.user._id = doc._id; // cache for next time
    return doc._id;
  }
  return null;
}

// List my check-ins + form to start a timer
router.get('/', ensureAuth, async (req, res) => {
  const userId = await getUserIdFromSession(req);
  if (!userId) return res.redirect('/login');

  const checkins = await Checkin.find({ userId }).sort({ createdAt: -1 });
  res.render('checkins', { title: 'Safety Check Timer', checkins, user: req.session.user });
});

// Start a new timer (minutes from now)
router.post('/', ensureAuth, async (req, res) => {
  const userId = await getUserIdFromSession(req);
  if (!userId) return res.redirect('/login');

  const minutes = Math.max(1, Number(req.body.dueMinutes || 0));
  const dueAt = new Date(Date.now() + minutes * 60000);

  await Checkin.create({
    userId,            // ✅ guaranteed now
    dueAt
  });

  res.redirect('/checkins');
});

// Resolve (I’m safe)
router.post('/:id/resolve', ensureAuth, async (req, res) => {
  const userId = await getUserIdFromSession(req);
  if (!userId) return res.redirect('/login');

  await Checkin.findOneAndUpdate(
    { _id: req.params.id, userId },
    { resolved: true }
  );
  res.redirect('/checkins');
});

module.exports = router;

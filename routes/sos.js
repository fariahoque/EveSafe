// routes/sos.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Volunteer = require('../models/volunteer');
const sendSOSAlert = require('../mailer');

// auth guard: JSON for XHR, redirect for normal nav
function ensureAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.get('accept')?.includes('json')) {
    return res.status(401).json({ ok: false, reason: 'auth' });
  }
  return res.redirect('/login');
}

// simple health check
router.get('/ping', (req, res) => {
  res.type('text').send('sos ok');
});

// voice/button SOS endpoint
router.post('/', ensureAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const area = user.area;
    const userName = user.name;
    const emergencyEmail = user.emergencyEmail || user.emergencyContact;

    console.log('[SOS] trigger from', user.email, 'area:', area);

    let mailedContact = false;
    let mailedVolunteers = 0;

    if (emergencyEmail) {
      try {
        await sendSOSAlert(emergencyEmail, userName, 'Emergency SOS triggered.', area || 'Unknown area');
        mailedContact = true;
        console.log('[SOS] mailed emergency contact:', emergencyEmail);
      } catch (e) {
        console.error('[SOS] contact mail failed:', e.message);
      }
    } else {
      console.log('[SOS] no emergency contact on file');
    }

    // Fan-out to verified volunteers in user's area (best-effort)
    try {
      const vols = await mongoose.model('Volunteer').find({ area, verified: true }).lean();
      if (vols.length) {
        const ids = vols.map(v => v.userId);
        const ulist = await mongoose.connection.collection('users')
          .find({ _id: { $in: ids } })
          .project({ email: 1 })
          .toArray();

        for (const u of ulist) {
          if (u.email) {
            try {
              await sendSOSAlert(
                u.email,
                userName,
                'Emergency SOS (near you). Please check on them if possible.',
                area || 'Unknown area'
              );
              mailedVolunteers++;
            } catch (e) {
              console.error('[SOS] volunteer mail failed:', e.message, 'to:', u.email);
            }
          }
        }
        console.log('[SOS] volunteer mails sent:', mailedVolunteers);
      } else {
        console.log('[SOS] no verified volunteers in area');
      }
    } catch (e) {
      console.error('[SOS] volunteer fan-out failed:', e.message);
    }

    // JSON result (no 204) so frontend can see what happened
    return res.json({
      ok: true,
      ts: Date.now(),
      mailed: { contact: mailedContact, volunteers: mailedVolunteers }
    });
  } catch (e) {
    console.error('❌ SOS error:', e.message);
    return res.status(500).json({ ok: false, error: 'Failed to send SOS' });
  }
});

module.exports = router;

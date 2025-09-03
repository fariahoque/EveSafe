// routes/sos.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Volunteer = require('../models/volunteer');
const sendSOSAlert = require('../mailer');

// auth guard
function ensureAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
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

    console.log('[SOS] voice trigger from', user.email, 'area:', area);

    if (emergencyEmail) {
      await sendSOSAlert(emergencyEmail, userName, 'Emergency SOS triggered.', area || 'Unknown area');
      console.log('[SOS] mailed emergency contact:', emergencyEmail);
    } else {
      console.log('[SOS] no emergency contact on file');
    }

    try {
      const vols = await mongoose.model('Volunteer').find({ area, verified: true }).lean();
      if (vols.length) {
        const ids = vols.map(v => v.userId);
        const ulist = await mongoose.connection.collection('users')
          .find({ _id: { $in: ids } })
          .project({ email: 1 })
          .toArray();

        let sent = 0;
        for (const u of ulist) {
          if (u.email) {
            await sendSOSAlert(
              u.email,
              userName,
              'Emergency SOS (near you). Please check on them if possible.',
              area || 'Unknown area'
            );
            console.log('[SOS] mailed volunteer:', u.email);
            sent++;
          }
        }
        if (!sent) console.log('[SOS] volunteers found but no emails present');
      } else {
        console.log('[SOS] no verified volunteers in area');
      }
    } catch (e) {
      console.error('[SOS] volunteer fan-out failed:', e.message);
    }

    return res.sendStatus(204); // no redirect (keeps mic running)
  } catch (e) {
    console.error('❌ SOS error:', e.message);
    return res.status(500).send('Failed to send SOS');
  }
});

module.exports = router;

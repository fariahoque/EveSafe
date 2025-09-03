const express = require('express');
const path = require('path');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const connectDB = require('./config/db');
const accountRoutes = require('./models/account');
const Report = require('./models/report');
const sendSOSAlert = require('./mailer'); // for sending emergency emails
require('dotenv').config();
const mongoose = require('mongoose');

const Volunteer = require('./models/volunteer');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
// your session config can stay as-is; defaults are fine for local dev

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: true
}));

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', accountRoutes);
// Safety Check Timer routes
const checkinRoutes = require('./routes/checkin');
app.use('/checkins', checkinRoutes);
const ratingRoutes = require('./routes/ratings');
app.use('/ratings', ratingRoutes);
// Volunteers routes
const volunteerRoutes = require('./routes/volunteers');
app.use('/volunteers', volunteerRoutes);
const sosRoutes = require('./routes/sos');
app.use('/sos', sosRoutes);
// 👉 NEW Danger Zone routes (ADD THESE TWO LINES)
const dangerRoutes = require('./routes/danger');
app.use('/danger', dangerRoutes);

// ✅ Moved these route mounts BELOW the middleware so req.body + session work
const routeApi = require('./routes/route');
app.use('/api/route', routeApi);
const placesRoutes = require('./routes/places');
app.use('/places', placesRoutes);

// Public routes
app.get('/', (req, res) => {
  res.redirect('/register');
});

app.get('/register', (req, res) => {
  res.render('register', { title: 'Register' });
});

app.get('/register-success', (req, res) => {
  res.render('register-success', { title: 'Registration Successful' });
});

app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

// Welcome page (logged-in users)
app.get('/welcome', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('welcome', { title: 'Welcome', user: req.session.user });
});
// Safe Route Finder page
app.get('/safe-route', (req, res) => {
  if (!req.session.user) return res.redirect('/login'); // keep it behind login
  res.render('safe-route', { title: 'Safe Route Finder' });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Anonymous report form
app.get('/report', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('report', { title: 'Submit Report' });
});

// Handle report submission
app.post('/report', async (req, res) => {
  try {
    const { message, area, lat, lng } = req.body;

    // Save report in DB
    await Report.create({ message, area, lat, lng });

    // Send SOS email to emergency contact
    const userName = req.session.user.name;
    const emergencyEmail = req.session.user.emergencyEmail || req.session.user.emergencyContact;
    if (emergencyEmail) {
      await sendSOSAlert(emergencyEmail, userName, message, area);
    }

    // ALSO notify verified volunteers in this area
    try {
      const vols = await Volunteer.find({ area, verified: true }).lean();
      if (vols.length) {
        const ids = vols.map(v => v.userId);
        const users = await mongoose.connection.collection('users')
          .find({ _id: { $in: ids } })
          .project({ email: 1 })
          .toArray();

        for (const u of users) {
          if (u.email) {
            await sendSOSAlert(u.email, userName, message, area);
          }
        }
      }
    } catch (e) {
      console.error('Volunteer fan-out failed:', e.message);
    }

    res.redirect('/report-success');
  } catch (err) {
    console.error('❌ Error submitting report:', err.message);
    res.status(500).send('Error submitting report');
  }
});

// Report success page
app.get('/report-success', (req, res) => {
  res.render('report-success', {
    title: 'Report Submitted',
    user: req.session.user
  });
});

// Admin-only view of all reports
app.get('/admin/reports', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@evesafe.com') {
    return res.status(403).send('Access denied: Admins only');
  }

  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.render('admin-reports', {
      title: 'All Area Reports',
      reports,
      user: req.session.user
    });
  } catch (err) {
    console.error('❌ Error loading admin reports:', err.message);
    res.status(500).send('Failed to load reports');
  }
});

// Delete a report by ID (admin only)
app.post('/admin/reports/delete/:id', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@evesafe.com') {
    return res.status(403).send('Access denied');
  }

  try {
    await Report.findByIdAndDelete(req.params.id);
    res.redirect('/admin/reports');
  } catch (err) {
    console.error('❌ Failed to delete report:', err.message);
    res.status(500).send('Error deleting report');
  }
});

// User view - reports from user's own area
app.get('/my-area-reports', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const area = req.session.user.area;
  const reports = await Report.find({ area }).sort({ createdAt: -1 });

  res.render('area-reports', {
    title: 'Reports in Your Area',
    reports,
    area
  });
});

// === Safety Check Timer CRON JOB (runs every minute) ===
// Paste this block right ABOVE: app.listen(PORT, ...)
const cron = require('node-cron');

cron.schedule('* * * * *', async () => {
  try {
    const Checkin = require('./models/checkin');

    const now = new Date();
    const overdue = await Checkin.find({ dueAt: { $lt: now }, resolved: false });

    for (const chk of overdue) {
      // Look up the user directly from the 'users' collection by _id
      const user = await mongoose.connection
        .collection('users')        // ← if your users collection has a different name, tell me
        .findOne({ _id: chk.userId });

      const toEmail = user?.emergencyEmail || user?.emergencyContact;
      if (toEmail) {
        await sendSOSAlert(
          toEmail,
          user?.name || 'EveSafe User',
          'Missed safety check-in.',
          user?.area || 'Unknown area'
        );
      }

      // ALSO notify verified volunteers in the user's area  <<< ADDED
      try {
        if (user?.area) {
          const vols = await Volunteer.find({ area: user.area, verified: true }).lean();
          if (vols.length) {
            const ids = vols.map(v => v.userId);
            const ulist = await mongoose.connection.collection('users')
              .find({ _id: { $in: ids } })
              .project({ email: 1 })
              .toArray();

            for (const u of ulist) {
              if (u.email) {
                await sendSOSAlert(
                  u.email,
                  user?.name || 'EveSafe User',
                  'Missed safety check-in (near you). Please check on them if possible.',
                  user?.area || 'Unknown area'
                );
              }
            }
          }
        }
      } catch (e) {
        console.error('Volunteer fan-out (cron) failed:', e.message);
      }

      // Mark as resolved so we don’t send again
      chk.resolved = true;
      await chk.save();
    }
  } catch (err) {
    console.error('❌ Safety Check Timer cron error:', err.message);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// (duplicate safe-route kept as-is below; it’s redundant but unchanged per your request)
app.get('/safe-route', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('safe-route', { title: 'Safe Route Finder' });
});

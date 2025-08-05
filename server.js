const express = require('express');
const path = require('path');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const connectDB = require('./config/db');
const accountRoutes = require('./models/account');
const Report = require('./models/report');
const sendSOSAlert = require('./mailer'); // for sending emergency emails
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

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
    const { message, area } = req.body;

    // Save report in DB
    await Report.create({ message, area });

    // Send SOS email to emergency contact only
    const userName = req.session.user.name;
    const emergencyEmail = req.session.user.emergencyEmail;
    await sendSOSAlert(emergencyEmail, userName, message, area);

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
      user: req.session.user  // optional, in case you need user context in template
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

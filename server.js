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
  saveUninitialized: true,
  cookie: { secure: false }  // Use 'false' in development
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

// Registration page
app.get('/register', (req, res) => {
  res.render('register', { title: 'Register' });
});

// Registration success page
app.get('/register-success', (req, res) => {
  res.render('register-success', { title: 'Registration Successful' });
});

// Login page
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

// Login handler
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).send('Invalid credentials');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send('Invalid credentials');

    // Store user info in session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      area: user.area,
      emergencyEmail: user.emergencyEmail,
      isVolunteer: user.isVolunteer
    };

    // Redirect to welcome page after successful login
    res.redirect('/welcome');
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).send('Server error');
  }
});

// Welcome page (logged-in users)
app.get('/welcome', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('welcome', { title: 'Welcome', user: req.session.user });
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Anonymous report form
app.get('/report', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('report', { title: 'Submit Report' });
});

// Handle report submission (send SOS email to emergency contact)
app.post('/report', async (req, res) => {
  try {
    const { message, area } = req.body;

    // Save the report in DB
    await Report.create({ message, area });

    // Get reportee's name from the session
    const userName = req.session.user.name;

    // Send SOS email to emergency contact
    const emergencyEmail = req.session.user.emergencyEmail;
    sendSOSAlert(emergencyEmail, userName, message, area);

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

  const reports = await Report.find().sort({ createdAt: -1 });
  res.render('admin-reports', { title: 'All Reports', reports });
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

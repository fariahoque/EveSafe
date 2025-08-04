const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/account');

// Display Home Page with links
router.get('/', (req, res) => {
  res.render('home');
});

// Serve registration form
// Show register form
router.get('/register', (req, res) => {
  res.render('register'); // this renders views/register.ejs
});


// Handle registration form submission
// ...existing code...
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).send('User already exists');

    // Hash the password before saving
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ name, email, password: hashedPassword });
    await user.save();

    res.redirect('/api/login');
  } catch (err) {
    console.error('❌ Registration Error:', err.message);
    res.status(500).send('Server error');
  }
});
// Serve login form
router.get('/login', (req, res) => {
  res.render('login');
});

// Handle login form submission
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).send('Invalid email or password');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send('Invalid email or password');

    // Store user in session (without password)
    req.session.user = { name: user.name, email: user.email, id: user._id };
    res.redirect('/api/welcome');
  } catch (err) {
    console.error('❌ Login Error:', err.message);
    res.status(500).send('Server error');
  }
});

// Show welcome page after login
router.get('/welcome', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/api/login');
  }

  res.render('welcome', { user: req.session.user });
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('❌ Logout Error:', err.message);
      return res.status(500).send('Logout failed');
    }
    res.redirect('/');
  });
});

module.exports = router;

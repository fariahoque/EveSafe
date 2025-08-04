const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

// ✅ User Schema with isVolunteer
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  password: String,
  area: String,
  emergencyEmail: { type: String, required: true },
  isVolunteer: { type: Boolean, default: false }
});

const User = mongoose.model('User', UserSchema);

// ✅ Register route
router.post('/register', async (req, res) => {
  const { name, email, password, area, emergencyEmail, isVolunteer } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).send('User already exists');

    user = new User({
      name,
      email,
      password,
      area,
      emergencyEmail,
      isVolunteer: isVolunteer === 'true'
    });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    res.redirect('/register-success');
  } catch (err) {
    console.error('❌ Register error:', err.message);
    res.status(500).send('Server error');
  }
});

// ✅ Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).send('Invalid credentials');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send('Invalid credentials');

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      area: user.area,
      emergencyEmail: user.emergencyEmail,
      isVolunteer: user.isVolunteer
    };

    res.redirect('/welcome');
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;

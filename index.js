require('dotenv').config(); // Load .env first

const express = require('express');
const session = require('express-session');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');

const app = express();
const port = 3000;

// Set up EJS for rendering views
app.set('view engine', 'ejs');              // Enables EJS
app.set('views', './views');                // Views folder location
app.use(express.urlencoded({ extended: true }));  // Parses form data


// Connect to MongoDB
connectDB();

// Middleware for parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Session middleware - add before routes
app.use(session({
  secret: process.env.SESSION_SECRET || 'evesafe_fallback_secret',
  resave: false,
  saveUninitialized: true
}));

// Global variable middleware for session user
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use('/', authRoutes);

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});

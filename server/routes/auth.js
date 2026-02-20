const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, publicKey, encryptedPrivateKey } = req.body;

    if (!username || !password || !publicKey || !encryptedPrivateKey) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Username already taken' });

    const user = await User.create({
      username: username.toLowerCase(),
      password,
      publicKey,
      encryptedPrivateKey,
    });

    res.status(201).json({
      token: generateToken(user._id),
      user: user.toPublicJSON(),
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join('. ') });
    }
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ message: 'Username and password required' });

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await user.matchPassword(password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    // Return encrypted private key so client can decrypt it locally with passphrase
    res.json({
      token: generateToken(user._id),
      user: user.toPublicJSON(),
      encryptedPrivateKey: user.encryptedPrivateKey,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error during login' });
  }
});

// GET /api/auth/me — get current user profile
router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

// GET /api/auth/keys — get own encrypted private key (authenticated)
// Used when user logs in on a new device
router.get('/keys', protect, async (req, res) => {
  const user = await User.findById(req.user._id).select('encryptedPrivateKey publicKey');
  res.json({
    publicKey: user.publicKey,
    encryptedPrivateKey: user.encryptedPrivateKey,
  });
});

module.exports = router;

const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/search?q=username — search users to add as contact
router.get('/search', protect, async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 2)
      return res.status(400).json({ message: 'Search query too short' });

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.user._id }, // exclude self
    })
      .select('username publicKey isOnline lastSeen')
      .limit(10);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Search failed' });
  }
});

// GET /api/users/:username — get a user's public profile + public key
router.get('/:username', protect, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).select(
      'username publicKey isOnline lastSeen'
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/users/contacts — add a contact
router.post('/contacts', protect, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: 'Username required' });

    const contact = await User.findOne({ username: username.toLowerCase() });
    if (!contact) return res.status(404).json({ message: 'User not found' });
    if (contact._id.equals(req.user._id))
      return res.status(400).json({ message: 'Cannot add yourself' });

    const me = await User.findById(req.user._id);
    const already = me.contacts.find((c) => c.user?.equals(contact._id));
    if (already) return res.status(400).json({ message: 'Already in contacts' });

    me.contacts.push({
      user: contact._id,
      username: contact.username,
      publicKey: contact.publicKey,
    });
    await me.save();

    res.json({ message: 'Contact added', contact: contact.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add contact' });
  }
});

// GET /api/users/contacts/list — get own contacts list
router.get('/contacts/list', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id).populate('contacts.user', 'username publicKey isOnline lastSeen');
    res.json(me.contacts);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get contacts' });
  }
});

module.exports = router;

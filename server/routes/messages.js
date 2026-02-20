const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// POST /api/messages
router.post('/', protect, async (req, res) => {
  try {
    const { recipientUsername, encryptedForRecipient, encryptedForSender } = req.body;

    if (!recipientUsername || !encryptedForRecipient || !encryptedForSender)
      return res.status(400).json({ message: 'Missing required fields' });

    const validate = (pkg) => pkg.ciphertext && pkg.encKey && pkg.iv;
    if (!validate(encryptedForRecipient) || !validate(encryptedForSender))
      return res.status(400).json({ message: 'Invalid encrypted payload' });

    const recipient = await User.findOne({ username: recipientUsername.toLowerCase() });
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });
    if (recipient._id.equals(req.user._id))
      return res.status(400).json({ message: 'Cannot message yourself' });

    const message = await Message.create({
      sender: req.user._id,
      recipient: recipient._id,
      encryptedForRecipient,
      encryptedForSender,
    });

    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    const recipientId = recipient._id.toString();

    // The full message payload to send via socket
    const socketPayload = {
      _id: message._id,
      sender: {
        _id: req.user._id,
        username: req.user.username,
        publicKey: req.user.publicKey,
      },
      recipient: {
        _id: recipient._id,
        username: recipient.username,
      },
      encryptedForRecipient,
      encryptedForSender,
      createdAt: message.createdAt,
      read: false,
    };

    // Emit to recipient's personal room (always works if they're connected)
    io.to(recipientId).emit('new_message', socketPayload);

    // Also try direct socket id as fallback
    const recipientSocketId = onlineUsers[recipientId];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('new_message', socketPayload);
    }

    console.log(`Message sent: ${req.user.username} → ${recipient.username}`);
    console.log(`Recipient online: ${!!recipientSocketId}, room emitted: ${recipientId}`);

    res.status(201).json(socketPayload);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// GET /api/messages/:username
router.get('/:username', protect, async (req, res) => {
  try {
    const other = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!other) return res.status(404).json({ message: 'User not found' });

    const messages = await Message.find({
      $or: [
        { sender: req.user._id, recipient: other._id },
        { sender: other._id, recipient: req.user._id },
      ],
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'username publicKey')
      .populate('recipient', 'username');

    await Message.updateMany(
      { sender: other._id, recipient: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// GET /api/messages — all conversations
router.get('/', protect, async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: req.user._id }, { recipient: req.user._id }],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', req.user._id] },
              '$recipient',
              '$sender',
            ],
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$recipient', req.user._id] },
                    { $eq: ['$read', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'contact',
        },
      },
      { $unwind: '$contact' },
      {
        $project: {
          contact: { _id: 1, username: 1, publicKey: 1, isOnline: 1, lastSeen: 1 },
          lastMessage: 1,
          unreadCount: 1,
        },
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
    ]);

    res.json(conversations);
  } catch (err) {
    console.error('Conversations error:', err);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
});

// PATCH /api/messages/read/:username
router.patch('/read/:username', protect, async (req, res) => {
  try {
    const other = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!other) return res.status(404).json({ message: 'User not found' });
    await Message.updateMany(
      { sender: other._id, recipient: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to mark as read' });
  }
});

module.exports = router;

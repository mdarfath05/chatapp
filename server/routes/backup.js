const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const Backup = require('../models/Backup');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/backup/generate
 * Server gathers all encrypted messages for this user
 * and returns them as a structured blob.
 * Client will then encrypt this blob with a backup password.
 */
router.post('/generate', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all messages where user is sender or recipient
    const messages = await Message.find({
      $or: [{ sender: userId }, { recipient: userId }],
    })
      .populate('sender', 'username publicKey')
      .populate('recipient', 'username publicKey')
      .sort({ createdAt: 1 });

    // Get contacts
    const me = await User.findById(userId).populate(
      'contacts.user',
      'username publicKey'
    );

    // Structure the backup data
    // NOTE: messages are still in their encrypted form (encryptedForSender/Recipient)
    // The client will ADDITIONALLY encrypt the whole thing with a backup password
    const backupData = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      owner: {
        username: req.user.username,
        publicKey: req.user.publicKey,
      },
      contacts: me.contacts.map((c) => ({
        username: c.username,
        publicKey: c.publicKey,
      })),
      messages: messages.map((m) => ({
        _id: m._id,
        sender: { username: m.sender.username, publicKey: m.sender.publicKey },
        recipient: { username: m.recipient.username, publicKey: m.recipient.publicKey },
        encryptedForRecipient: m.encryptedForRecipient,
        encryptedForSender: m.encryptedForSender,
        read: m.read,
        createdAt: m.createdAt,
      })),
      stats: {
        totalMessages: messages.length,
        totalContacts: me.contacts.length,
      },
    };

    res.json({
      backupData,
      stats: backupData.stats,
    });
  } catch (err) {
    console.error('Backup generate error:', err);
    res.status(500).json({ message: 'Failed to generate backup' });
  }
});

/**
 * POST /api/backup/record
 * After client encrypts and saves the backup file,
 * record the metadata on server.
 */
router.post('/record', protect, async (req, res) => {
  try {
    const { type, driveFileId, messageCount, contactCount, sizeBytes } = req.body;

    // Upsert — update if exists, create if not
    const backup = await Backup.findOneAndUpdate(
      { user: req.user._id, type },
      {
        driveFileId: driveFileId || null,
        messageCount,
        contactCount,
        sizeBytes,
        status: 'completed',
        lastBackupAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Backup recorded', backup });
  } catch (err) {
    res.status(500).json({ message: 'Failed to record backup' });
  }
});

/**
 * GET /api/backup/history
 * Get user's backup history/metadata
 */
router.get('/history', protect, async (req, res) => {
  try {
    const backups = await Backup.find({ user: req.user._id }).sort({
      lastBackupAt: -1,
    });
    res.json(backups);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get backup history' });
  }
});

/**
 * POST /api/backup/restore
 * Client sends the decrypted backup data (after user enters backup password)
 * Server restores messages and contacts that don't already exist.
 */
router.post('/restore', protect, async (req, res) => {
  try {
    const { backupData } = req.body;

    if (!backupData || !backupData.messages || !backupData.contacts) {
      return res.status(400).json({ message: 'Invalid backup data structure' });
    }

    // Verify backup belongs to this user
    if (backupData.owner.username !== req.user.username) {
      return res.status(403).json({
        message: 'This backup belongs to a different user',
      });
    }

    let restoredMessages = 0;
    let restoredContacts = 0;
    const errors = [];

    // Restore contacts
    const me = await User.findById(req.user._id);
    for (const contact of backupData.contacts) {
      const already = me.contacts.find((c) => c.username === contact.username);
      if (!already) {
        me.contacts.push({
          username: contact.username,
          publicKey: contact.publicKey,
        });
        restoredContacts++;
      }
    }
    await me.save();

    // Restore messages — only insert ones that don't exist
    for (const msg of backupData.messages) {
      try {
        // Find sender and recipient by username
        const sender = await User.findOne({ username: msg.sender.username });
        const recipient = await User.findOne({ username: msg.recipient.username });

        if (!sender || !recipient) continue;

        // Check if message already exists
        const exists = await Message.findById(msg._id);
        if (exists) continue;

        await Message.create({
          _id: msg._id,
          sender: sender._id,
          recipient: recipient._id,
          encryptedForRecipient: msg.encryptedForRecipient,
          encryptedForSender: msg.encryptedForSender,
          read: msg.read,
          createdAt: msg.createdAt,
        });
        restoredMessages++;
      } catch (err) {
        errors.push(`Message ${msg._id}: ${err.message}`);
      }
    }

    res.json({
      message: 'Restore completed',
      restoredMessages,
      restoredContacts,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ message: 'Failed to restore backup' });
  }
});

module.exports = router;

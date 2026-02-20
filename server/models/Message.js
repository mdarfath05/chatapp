const mongoose = require('mongoose');

/**
 * Message Schema
 *
 * IMPORTANT — E2E Encryption Design:
 * - `encryptedForRecipient`: AES-256-GCM ciphertext + RSA-encrypted AES key for the recipient
 * - `encryptedForSender`:    Same message re-encrypted for the sender (so they can read their own sent msgs)
 * - The server stores ONLY ciphertext. It has zero ability to decrypt any message.
 * - Plaintext never touches the server.
 */
const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Encrypted payload for the recipient
    encryptedForRecipient: {
      ciphertext: { type: String, required: true }, // base64 AES-GCM ciphertext
      encKey: { type: String, required: true },      // base64 RSA-encrypted AES session key
      iv: { type: String, required: true },          // base64 AES-GCM IV (12 bytes)
    },
    // Encrypted payload for the sender (so sender can read own messages)
    encryptedForSender: {
      ciphertext: { type: String, required: true },
      encKey: { type: String, required: true },
      iv: { type: String, required: true },
    },
    // Whether the recipient has read the message
    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

// Index for fast conversation queries
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, read: 1 });

module.exports = mongoose.model('Message', messageSchema);

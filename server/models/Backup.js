const mongoose = require('mongoose');

/**
 * Backup Schema
 *
 * Stores metadata about a user's encrypted backup.
 * The actual backup content is either:
 * - Downloaded as a JSON file (local backup)
 * - Uploaded to Google Drive (cloud backup)
 *
 * We NEVER store the decrypted messages here.
 * The backup file itself is AES-256 encrypted with a backup password.
 */
const backupSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Type of backup
    type: {
      type: String,
      enum: ['local', 'google_drive'],
      required: true,
    },
    // For Google Drive backups — the file ID in Drive
    driveFileId: {
      type: String,
      default: null,
    },
    // Backup stats
    messageCount: { type: Number, default: 0 },
    contactCount: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    // Encryption info (NOT the key — just metadata)
    encryptionMethod: { type: String, default: 'AES-256-GCM + PBKDF2' },
    // Status
    status: {
      type: String,
      enum: ['completed', 'failed', 'in_progress'],
      default: 'completed',
    },
    lastBackupAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One backup record per user per type
backupSchema.index({ user: 1, type: 1 });

module.exports = mongoose.model('Backup', backupSchema);

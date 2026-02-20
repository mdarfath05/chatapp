/**
 * Backup Encryption Utilities
 *
 * How backup encryption works:
 *
 * 1. Server returns all messages (still in their E2E encrypted form)
 * 2. Client wraps the ENTIRE backup JSON in ANOTHER layer of AES-256-GCM encryption
 *    using the user's backup password (PBKDF2 derived)
 * 3. The result is a double-encrypted blob:
 *    - Inner layer: E2E encryption (RSA + AES per message)
 *    - Outer layer: Backup password encryption (AES-256-GCM)
 * 4. This blob is saved as a .cipherchat file or uploaded to Google Drive
 *
 * To restore:
 * 1. User provides backup password
 * 2. Outer layer decrypted → reveals the message blobs
 * 3. Messages restored to server
 * 4. User can read them using their normal private key (inner layer)
 */

import { arrayToBase64, base64ToArray } from './crypto';

const BACKUP_MAGIC = 'CIPHERCHAT_BACKUP_V1';

// Derive AES key from backup password
const deriveBackupKey = async (password, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * Encrypt the entire backup JSON with a backup password.
 * Returns a base64 string ready to save to file or Google Drive.
 */
export const encryptBackup = async (backupData, backupPassword) => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(backupPassword, salt);

  const jsonStr = JSON.stringify(backupData);
  const encoded = new TextEncoder().encode(jsonStr);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Package everything together
  const pkg = {
    magic: BACKUP_MAGIC,
    version: '1.0',
    createdAt: new Date().toISOString(),
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    ciphertext: arrayToBase64(ciphertext),
    stats: backupData.stats,
    owner: backupData.owner.username,
  };

  return JSON.stringify(pkg, null, 2);
};

/**
 * Decrypt a backup file string using the backup password.
 * Returns the original backupData object.
 */
export const decryptBackup = async (backupFileContent, backupPassword) => {
  let pkg;
  try {
    pkg = JSON.parse(backupFileContent);
  } catch {
    throw new Error('Invalid backup file — could not parse JSON');
  }

  if (pkg.magic !== BACKUP_MAGIC) {
    throw new Error('Invalid backup file — not a CipherChat backup');
  }

  try {
    const salt = base64ToArray(pkg.salt);
    const iv = base64ToArray(pkg.iv);
    const ciphertext = base64ToArray(pkg.ciphertext);

    const key = await deriveBackupKey(backupPassword, salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const jsonStr = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('Wrong backup password — could not decrypt');
  }
};

/**
 * Calculate size of a string in bytes
 */
export const getByteSize = (str) => new TextEncoder().encode(str).length;

/**
 * Format bytes to human readable
 */
export const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

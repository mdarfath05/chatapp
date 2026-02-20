/**
 * CipherChat Crypto Utilities
 *
 * Encryption scheme: Hybrid RSA-OAEP + AES-256-GCM
 *
 * How it works:
 * 1. On register: generate RSA-2048 key pair
 *    - Public key  → sent to server (stored in DB, shared with contacts)
 *    - Private key → encrypted client-side with PBKDF2(passphrase) → AES-GCM
 *                    The encrypted blob is sent to server (server cannot decrypt it)
 *
 * 2. On send message:
 *    a. Generate random AES-256 session key
 *    b. Encrypt message with AES-GCM
 *    c. Encrypt AES session key with recipient's RSA public key  → encryptedForRecipient
 *    d. Encrypt AES session key with sender's RSA public key     → encryptedForSender
 *    e. Send BOTH encrypted blobs to server — server sees only ciphertext
 *
 * 3. On receive message:
 *    a. Decrypt AES session key with own RSA private key
 *    b. Decrypt ciphertext with AES session key
 *    c. Display plaintext — never stored anywhere unencrypted
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const arrayToBase64 = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

export const base64ToArray = (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
};

// ─── RSA Key Pair Generation ──────────────────────────────────────────────────

export const generateKeyPair = async () => {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const pubRaw = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privRaw = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayToBase64(pubRaw),   // base64 SPKI
    privateKey: arrayToBase64(privRaw), // base64 PKCS8
  };
};

// ─── Private Key Encryption (passphrase-based) ───────────────────────────────

const deriveKey = async (passphrase, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptPrivateKey = async (privateKeyB64, passphrase) => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder().encode(privateKeyB64);
  const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return {
    ct: arrayToBase64(ct),
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
  };
};

export const decryptPrivateKey = async (pkg, passphrase) => {
  const salt = base64ToArray(pkg.salt);
  const iv = base64ToArray(pkg.iv);
  const ct = base64ToArray(pkg.ct);
  const key = await deriveKey(passphrase, salt);
  const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
};

// ─── Message Encryption ───────────────────────────────────────────────────────

const importPublicKey = (b64) =>
  window.crypto.subtle.importKey(
    'spki',
    base64ToArray(b64),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

const importPrivateKey = (b64) =>
  window.crypto.subtle.importKey(
    'pkcs8',
    base64ToArray(b64),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );

/**
 * Encrypt a message for a given RSA public key.
 * Returns { ciphertext, encKey, iv } — all base64.
 */
export const encryptMessage = async (plaintext, recipientPubKeyB64) => {
  const recipientPubKey = await importPublicKey(recipientPubKeyB64);

  // 1. Generate random AES-256 session key
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const aesRaw = await window.crypto.subtle.exportKey('raw', aesKey);

  // 2. Encrypt plaintext with AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const msgBytes = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    msgBytes
  );

  // 3. Encrypt AES key with recipient's RSA public key
  const encKey = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientPubKey,
    aesRaw
  );

  return {
    ciphertext: arrayToBase64(ciphertext),
    encKey: arrayToBase64(encKey),
    iv: arrayToBase64(iv),
  };
};

/**
 * Decrypt a message using our RSA private key.
 * pkg = { ciphertext, encKey, iv } — all base64.
 */
export const decryptMessage = async (pkg, privateKeyB64) => {
  const privateKey = await importPrivateKey(privateKeyB64);

  // 1. Decrypt AES session key with RSA private key
  const encAesKeyBytes = base64ToArray(pkg.encKey);
  const aesRaw = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encAesKeyBytes
  );

  // 2. Import AES key
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    aesRaw,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 3. Decrypt ciphertext
  const iv = base64ToArray(pkg.iv);
  const ciphertext = base64ToArray(pkg.ciphertext);
  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
};

// ─── Key Fingerprint ──────────────────────────────────────────────────────────

export const getKeyFingerprint = async (pubKeyB64) => {
  const bytes = base64ToArray(pubKeyB64);
  const hash = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .match(/.{4}/g)
    .join(' ');
};

// ─── PEM formatting ───────────────────────────────────────────────────────────

export const toPEM = (b64) =>
  `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;

export const fromPEM = (pem) =>
  pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n|\r/g, '');

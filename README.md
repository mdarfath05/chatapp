# 🔐 CipherChat — MERN Stack E2E Encrypted Messenger

A WhatsApp-inspired end-to-end encrypted chat app built with MongoDB, Express, React, and Node.js.

## 🔒 Encryption Architecture

```
Register:
  Client → generates RSA-2048 key pair
         → encrypts private key with PBKDF2(passphrase) → AES-256-GCM
         → sends { publicKey, encryptedPrivateKey } to server
         → server stores both (cannot decrypt private key)

Send Message:
  Client → generates random AES-256 session key
         → encrypts plaintext with AES-GCM
         → RSA-encrypts AES key with recipient's public key  → encryptedForRecipient
         → RSA-encrypts AES key with sender's public key     → encryptedForSender
         → sends ONLY ciphertext to server
         → server stores encrypted blobs, never sees plaintext

Receive Message:
  Client → RSA-decrypts AES session key with own private key
         → AES-GCM decrypts ciphertext
         → displays plaintext (never stored unencrypted)
```

**Result:** The server is a blind relay. Even if the database is compromised, all messages are unreadable ciphertext.

## 📁 Project Structure

```
cipherchat/
├── server/                    # Express + Socket.IO backend
│   ├── models/
│   │   ├── User.js            # User schema (stores pubkey + encrypted privkey)
│   │   └── Message.js         # Message schema (stores only ciphertext)
│   ├── routes/
│   │   ├── auth.js            # Register, login, get keys
│   │   ├── users.js           # Search, contacts
│   │   └── messages.js        # Send, fetch encrypted messages
│   ├── middleware/
│   │   └── auth.js            # JWT middleware
│   ├── index.js               # Entry: Express + Socket.IO + MongoDB
│   ├── package.json
│   └── .env.example
│
├── client/                    # React frontend
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── utils/
│   │   │   ├── crypto.js      # All E2E crypto (Web Crypto API)
│   │   │   └── api.js         # Axios instance with JWT
│   │   ├── context/
│   │   │   └── AuthContext.js # Auth state + socket management
│   │   ├── pages/
│   │   │   ├── AuthPage.js    # Login / Register
│   │   │   └── ChatPage.js    # Main chat layout
│   │   ├── components/
│   │   │   ├── Sidebar.js     # Contacts list
│   │   │   ├── ChatWindow.js  # Message list + send
│   │   │   └── KeysModal.js   # View/copy public key
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
│
└── package.json               # Root — runs both concurrently
```

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+
- MongoDB running locally (`mongod`) OR a MongoDB Atlas URI

### 2. Clone & Install
```bash
git clone <repo>
cd cipherchat
npm run install-all
```

### 3. Configure Environment
```bash
cd server
cp .env.example .env
# Edit .env:
#   MONGO_URI=mongodb://localhost:27017/cipherchat
#   JWT_SECRET=your_random_secret_here
#   CLIENT_URL=http://localhost:3000
```

### 4. Run (Development)
```bash
# From root:
npm run dev
# → Server: http://localhost:5000
# → Client: http://localhost:3000
```

## 🛠 Tech Stack

| Layer     | Technology              |
|-----------|-------------------------|
| Database  | MongoDB + Mongoose      |
| Backend   | Express.js + Node.js    |
| Real-time | Socket.IO               |
| Frontend  | React 18                |
| Auth      | JWT + bcrypt            |
| Crypto    | Web Crypto API (native) |

## 🔐 Security Properties

- **AES-256-GCM** — message encryption (authenticated encryption)
- **RSA-2048-OAEP** — session key wrapping
- **PBKDF2** (100k iterations, SHA-256) — passphrase key derivation
- **bcrypt** (12 rounds) — password hashing
- **Zero knowledge server** — plaintext never reaches the server
- **In-memory private key** — never written to localStorage or disk

## ✅ Features Built

- [x] User registration with RSA key pair generation
- [x] Login with passphrase-decrypted private key
- [x] JWT authentication
- [x] Contact search and add
- [x] Real-time encrypted messaging via Socket.IO
- [x] Online/offline status
- [x] Typing indicators
- [x] Message read receipts
- [x] Public key viewer + fingerprint
- [x] Data stored in MongoDB (only ciphertext)

## ❌ Not Built (Out of Scope)
- Voice/video calls
- Group chats
- Media/file sharing
- Status updates
- Google Drive sync (hook exists, needs OAuth)

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const backupRoutes = require('./routes/backup');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  },
});

// userId (string) → socketId
const onlineUsers = {};

app.set('io', io);
app.set('onlineUsers', onlineUsers);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/backup', backupRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── Socket Auth ──────────────────────────────────────────────────────────────
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id username publicKey');
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// ─── Socket Events ────────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  const userId = socket.user._id.toString();
  const username = socket.user.username;

  // Store socket mapping
  onlineUsers[userId] = socket.id;
  console.log(`✓ ${username} connected [${socket.id}]`);
  console.log(`  Online users: ${Object.keys(onlineUsers).length}`);

  // Mark online in DB
  await User.findByIdAndUpdate(userId, { isOnline: true });

  // Tell everyone this user is online
  socket.broadcast.emit('user_online', { userId, username });

  // Join own room (so server can emit directly to this user)
  socket.join(userId);

  // Typing indicator
  socket.on('typing', ({ recipientId, isTyping }) => {
    // Try both socket id and room
    const recipientSocketId = onlineUsers[recipientId];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('user_typing', {
        userId,
        username,
        isTyping,
      });
    }
    // Also emit to room
    io.to(recipientId).emit('user_typing', { userId, username, isTyping });
  });

  // Read receipts
  socket.on('messages_read', ({ senderId }) => {
    const senderSocketId = onlineUsers[senderId];
    if (senderSocketId) {
      io.to(senderSocketId).emit('messages_read', { readBy: userId });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    delete onlineUsers[userId];
    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
    socket.broadcast.emit('user_offline', { userId, username });
    console.log(`✗ ${username} disconnected`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/cipherchat')
  .replace('mongodb://localhost', 'mongodb://127.0.0.1');

mongoose.connect(MONGO_URI).then(() => {
  console.log('✓ MongoDB connected');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('✗ MongoDB connection failed:', err.message);
  process.exit(1);
});

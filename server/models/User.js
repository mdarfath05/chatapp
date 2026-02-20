const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
    },
    // RSA public key (stored in plain — it's meant to be public)
    publicKey: {
      type: String,
      required: [true, 'Public key is required'],
    },
    // RSA private key encrypted with user's passphrase on the CLIENT side
    // Server NEVER sees the raw private key
    encryptedPrivateKey: {
      type: Object, // { ct, salt, iv } — all base64
      required: true,
    },
    contacts: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        publicKey: String,
      },
    ],
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Never send password or encrypted private key to client unless explicitly needed
userSchema.methods.toPublicJSON = function () {
  return {
    _id: this._id,
    username: this.username,
    publicKey: this.publicKey,
    isOnline: this.isOnline,
    lastSeen: this.lastSeen,
  };
};

module.exports = mongoose.model('User', userSchema);

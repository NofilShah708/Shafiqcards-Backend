const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Never return password field by default
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

// -------------------------------------------------------
// Pre-save hook — hash password before saving to DB
// Only re-hashes if the password field was modified
// -------------------------------------------------------
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// -------------------------------------------------------
// Instance method — compare plain password with hash
// -------------------------------------------------------
adminSchema.methods.matchPassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);

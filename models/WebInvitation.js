const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const EventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date },
  time: { type: String },
  venue: { type: String },
});

const WebInvitationSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  whatsappNumber: {
    type: String,
    required: false,
    trim: true,
    default: '',
  },
  brideName: {
    type: String,
    required: true,
    trim: true,
  },
  groomName: {
    type: String,
    required: true,
    trim: true,
  },
  weddingDate: {
    type: Date,
  },
  description: {
    type: String,
    trim: true,
  },
  events: [EventSchema],
  media: {
    type: [String],
    default: [],
  },
  template: {
    type: String,
    default: 'basic',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  traffic: {
    totalViews: {
      type: Number,
      default: 0,
    },
    sourceCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    visits: [
      {
        date: {
          type: Date,
          default: Date.now,
        },
        source: {
          type: String,
          default: 'Direct',
        },
        page: {
          type: String,
          default: 'invitation',
        },
        ip: {
          type: String,
          default: '',
        },
        userAgent: {
          type: String,
          default: '',
        },
      }
    ],
  },
});

// Hash password before saving
WebInvitationSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
WebInvitationSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('WebInvitation', WebInvitationSchema);

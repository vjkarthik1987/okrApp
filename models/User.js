const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: false // Unique within org, so don't enforce globally here
  },
  role: {
    type: String,
    enum: ['super_admin', 'function_head', 'okr_editor', 'employee'],
    default: 'employee'
  },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  location: String,
  designation: String,
  band: String,
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    default: 'Prefer not to say'
  },
  joiningDate: Date
}, { timestamps: true });

// Use email instead of username for passport
userSchema.plugin(passportLocalMongoose, {
  usernameField: 'email'
});

userSchema.index({ email: 1, organization: 1 });

module.exports = mongoose.model('User', userSchema);

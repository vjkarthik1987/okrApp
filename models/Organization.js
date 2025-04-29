const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  orgName: {
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    match: /^[a-z0-9\-]+$/  // No spaces, safe for URLs
  },
  displayName: {
    type: String,
    required: true
  },
  industry: String,

  licenseModel: {
    type: String,
    enum: ['free', 'standard', 'enterprise'],
    default: 'free'
  },
  licenseActivated: {
    type: Boolean,
    default: false
  },
  licenseStartDate: {
    type: Date,
    default: Date.now
  },
  licenseEndDate: Date,

  numberOfUsers: {
    type: Number,
    default: 1
  },

  active: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  financialYearStartMonth: {  
    type: Number,
    min: 1,
    max: 12,
    default: 1 // January by default
  },
});

module.exports = mongoose.model('Organization', organizationSchema);
const mongoose = require('mongoose');

const initiativeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  expectedOutcome: {
    type: String,
    required: true,
    trim: true
  },
  outcomeAchieved: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['Initiated', 'Closed', 'Deferred/On Hold', 'Blocked', 'Dropped'],
    default: 'Initiated'
  },
  keyResultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KeyResult',
    default: null
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

module.exports = mongoose.model('Initiative', initiativeSchema);
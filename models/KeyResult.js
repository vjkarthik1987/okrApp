const mongoose = require('mongoose');

const keyResultSchema = new mongoose.Schema({
  objectiveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Objective',
    required: true
  },

  title: { type: String, required: true },

  metricType: {
    type: String,
    enum: ['percent', 'number', 'boolean', 'milestone'],
    required: true
  },

  startValue: mongoose.Schema.Types.Mixed,
  targetValue: mongoose.Schema.Types.Mixed,

  direction: {
    type: String,
    enum: ['increase', 'decrease', 'auto'],
    default: 'auto'
  },

  milestones: [
    {
      label: { type: String, required: true },
      completed: { type: Boolean, default: false },
      weight: { type: Number, default: 1 }
    }
  ],

  updates: [
    {
      updateDate: { type: Date, default: Date.now },
      updateValue: mongoose.Schema.Types.Mixed,
      updateText: String,
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  ],

  progressValue: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['on track', 'at risk', 'off track'],
    default: 'on track'
  },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  visibility: {
    type: String,
    enum: ['private', 'team', 'organization'],
    default: 'organization'
  },

  aiFeedback: {
    verdict: String,
    suggestedRewrite: String,
    issues: [String]
  },

  deactivated: {
    type: Boolean,
    default: false
  },

  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

module.exports = mongoose.model('KeyResult', keyResultSchema);
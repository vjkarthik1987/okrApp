const mongoose = require('mongoose');

const keyResultSchema = new mongoose.Schema({
  objectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Objective', required: true },
  title: { type: String, required: true },
  metricType: { type: String, enum: ['percent', 'number', 'boolean', 'milestone'], required: true },
  ownerTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  editableBy: {
    type: String,
    enum: ['ownerOnly', 'ownerTeam', 'objectiveTeam', 'orgAdmins'],
    default: 'ownerTeam'
  },
  startValue: { type: mongoose.Schema.Types.Mixed, default: null },
  targetValue: { type: mongoose.Schema.Types.Mixed, default: null },
  direction: { type: String, enum: ['increase', 'decrease', 'auto'], default: 'auto' },
  
  dueDate: { type: Date }, // 🎯 Should default to objective cycle end date

  actualCompletionDate: { type: Date }, // 🎯 Set when progress hits 100%, clear otherwise

  milestones: [
    {
      label: { type: String, required: true },
      completed: { type: Boolean, default: false },
      weight: { type: Number, default: 1 },
      dueDate: { type: Date }
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
  status: { type: String, enum: ['on track', 'at risk', 'off track'], default: 'on track' },
  
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  visibility: { type: String, enum: ['private', 'team', 'organization'], default: 'organization' },

  aiFeedback: {
    verdict: String,
    suggestedRewrite: String,
    issues: [String]
  },

  deactivated: { type: Boolean, default: false },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});

module.exports = mongoose.model('KeyResult', keyResultSchema);
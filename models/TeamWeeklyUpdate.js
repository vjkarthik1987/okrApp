const mongoose = require('mongoose');

const teamWeeklyUpdateSchema = new mongoose.Schema({
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },

  weekCycle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeekCycle',
    required: true
  },

  weekStart: {
    type: Date,
    required: true
  },

  weekEnd: {
    type: Date,
    required: true
  },

  // 🌟 TEAM-LEVEL SUMMARY
  summaryText: {
    type: String,
    default: ''
  },

  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  submittedAt: {
    type: Date
  },

  // 🎯 OBJECTIVES & KEY RESULTS
  objectives: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Objective'
  }],
  keyResults: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KeyResult'
  }],

  // High-level OKR summary (team-wide)
  okrSummary: {
    type: String,
    default: ''
  },

  // Detailed summaries per Objective/KR
  okrSummaries: [{
    objectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Objective' },
    keyResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'KeyResult' },
    summaryText: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
  }],

  // ✅ ACTION ITEMS
  actionItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActionItem'
  }],
  actionItemSummary: {
    type: String,
    default: ''
  },

  // 📘 DIARY ENTRIES
  diaryEntryStats: {
    totalExpected: { type: Number, default: 0 },
    submitted: { type: Number, default: 0 },
    nonCompliant: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  diaryThemes: {
    type: [String], // e.g., ["Customer Issues", "Collaboration", "AI Use"]
    default: []
  },
  diarySummary: {
    type: String,
    default: ''
  },

  aiGenerated: {
    type: Boolean,
    default: false
  },

  isFinalized: {
    type: Boolean,
    default: false
  },

  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  }
}, {
  timestamps: true
});

teamWeeklyUpdateSchema.index({ teamId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('TeamWeeklyUpdate', teamWeeklyUpdateSchema);

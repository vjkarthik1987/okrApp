const mongoose = require('mongoose');

const objectiveSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ⬇️ Change here
  cycle: [{ type: String, required: true }], // now array!

  year: {
    type: String,
    required: true
  },

  progressValue: { type: Number, default: 0 },
  progressHistory: [
    {
      value: Number,
      date: { type: Date, default: Date.now }
    }
  ],
  status: {
    type: String,
    enum: ['on track', 'at risk', 'off track'],
    default: 'on track'
  },
  summaryUpdate: String,
  parentObjective: { type: mongoose.Schema.Types.ObjectId, ref: 'Objective', default: null },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

module.exports = mongoose.model('Objective', objectiveSchema);

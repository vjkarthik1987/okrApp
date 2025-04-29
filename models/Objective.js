const mongoose = require('mongoose');

const objectiveSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' }, // Creator of the Objective
  assignedTeams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }], // Teams allowed to create/update KRs
  editableBy: {
    type: String,
    enum: ['ownerOnly', 'ownerTeam', 'objectiveTeam', 'orgAdmins'],
    default: 'ownerTeam'
  },

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

objectiveSchema.index({ assignedTeams: 1 });

module.exports = mongoose.model('Objective', objectiveSchema);

const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  parentTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  functionHead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  okrEditors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  activeTeam: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Team', teamSchema);
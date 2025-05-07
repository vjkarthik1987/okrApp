const mongoose = require('mongoose');

const queryLogSchema = new mongoose.Schema({
  query: String,
  response: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  matchedChunks: [
    {
      text: String,
      similarity: Number
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QueryLog', queryLogSchema);
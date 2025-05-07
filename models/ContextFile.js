const mongoose = require('mongoose');

const contextFileSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  content: { type: String, required: true },
  embedding: { type: [Number], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ContextFile', contextFileSchema);

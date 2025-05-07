const mongoose = require('mongoose');

const contextChunkSchema = new mongoose.Schema({
  text: String,
  embedding: [Number]
});

const contextFileSchema = new mongoose.Schema({
  title: String,
  description: String,
  content: String, // raw content
  chunks: [contextChunkSchema], // <== new field
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ContextFile', contextFileSchema);

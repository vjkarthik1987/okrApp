// models/ActiveCycle.js
const mongoose = require('mongoose');

const activeCycleSchema = new mongoose.Schema({
  year: {
    type: String,
    required: true
  },
  quarters: {
    type: [String], // e.g., ['Q1', 'Q2', 'Q3']
    default: []
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  }
});

module.exports = mongoose.model('ActiveCycle', activeCycleSchema);

// models/OKRCycle.js
const mongoose = require('mongoose');

const okrCycleSchema = new mongoose.Schema({
  label: { type: String, required: true }, // e.g., "Q1-2025", "2025"
  type: { type: String, enum: ['quarter', 'year'], required: true },
  isEnabled: { type: Boolean, default: false },

  startDate: { type: Date, required: true }, // 🎯 New field
  endDate: { type: Date, required: true },   // 🎯 New field

  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  }
});

module.exports = mongoose.model('OKRCycle', okrCycleSchema);

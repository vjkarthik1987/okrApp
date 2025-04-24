const mongoose = require('mongoose');

const weekCycleSchema = new mongoose.Schema({
  cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'OKRCycle', required: true },
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date, required: true },
  label: { type: String, required: true }, // e.g., "Week 3 - Apr 17 to Apr 23"
  isActive: { type: Boolean, default: true },
});

weekCycleSchema.index({ cycle: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WeekCycle', weekCycleSchema);
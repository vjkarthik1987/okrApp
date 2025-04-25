const mongoose = require('mongoose');

const diaryEntrySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    weekCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'WeekCycle', required: true },
    date: { type: Date, required: true },
    content: { type: String, required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    createdAt: { type: Date, default: Date.now },
});
  
module.exports = mongoose.model('DiaryEntry', diaryEntrySchema);
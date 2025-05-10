const mongoose = require('mongoose');

const ActionItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  cycle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OKRCycle',
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  meeting: {
    type: String,
    trim: true
  },
  objectiveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Objective'
  },
  keyResultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KeyResult'
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActionItem',
    default: null
  },
  dueDate: {
    type: Date
  },
  updates: [
    {
      updateDate: {
        type: Date,
        default: Date.now
      },
      updateText: {
        type: String,
        trim: true,
        required: true
      }
    }
  ],
  comments: [   // 🔥 NEW
    {
      commenter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      commentText: {
        type: String,
        required: true,
        trim: true
      },
      commentDate: {
        type: Date,
        default: Date.now
      }
    }
  ],
  closureDate: {   // 🔥 NEW
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['Not Started', 'In Progress', 'Completed', 'Blocked', 'Deferred', 'On Hold'],
    default: 'Not Started'
  },
  initiativeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Initiative',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ActionItem', ActionItemSchema);
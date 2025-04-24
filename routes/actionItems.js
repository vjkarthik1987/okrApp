const express = require('express');
const router = express.Router({ mergeParams: true });
const ActionItem = require('../models/ActionItem');
const User = require('../models/User');
const OKRCycle = require('../models/OKRCycle');
const Objective = require('../models/Objective');
const KeyResult = require('../models/KeyResult');
const { isLoggedIn } = require('../middleware/auth');
const Initiative = require('../models/Initiative');

// Index
router.get('/', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;

  const actionItems = await ActionItem.find({ organization: req.user.organization })
    .populate('assignedTo cycle parent')
    .lean(); // Make it plain JS for easier manipulation

  // Step 1: Group by _id for fast lookup
  const byId = {};
  actionItems.forEach(item => byId[item._id.toString()] = item);

  // Step 2: Attach children
  actionItems.forEach(item => {
    if (item.parent) {
      const parent = byId[item.parent._id.toString()];
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(item);
      }
    }
  });

  // Step 3: Only keep root-level items
  const rootItems = actionItems.filter(item => !item.parent);

  res.render('actionItems/index', { orgName, actionItems: rootItems });
});


// New
router.get('/new', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const { initiativeId } = req.query;

  const users = await User.find({ organization: req.user.organization });
  const cycles = await OKRCycle.find({ organization: req.user.organization, isEnabled: true });
  const objectives = await Objective.find({ organization: req.user.organization });
  const keyResults = await KeyResult.find({ organization: req.user.organization });
  const actionItems = await ActionItem.find({ organization: req.user.organization });
  const initiatives = await Initiative.find({ organization: req.user.organization });

  res.render('actionItems/new', {
    orgName,
    users,
    cycles,
    objectives,
    keyResults,
    actionItems,
    initiatives,
    preselectedInitiativeId: initiativeId || null,
  });
});

// Create
router.post('/', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const { title, description, assignedTo, cycle, dueDate, meeting, objectiveId, keyResultId, parent, initiativeId } = req.body;

  const actionItem = new ActionItem({
    title,
    description,
    assignedTo,
    assignedBy: req.user._id,
    createdBy: req.user._id,
    cycle,
    dueDate,
    meeting,
    status: 'Not Started',
    objectiveId: objectiveId || null,
    keyResultId: keyResultId || null,
    initiativeId: initiativeId || null,
    parent: parent || null,
    organization: req.user.organization
  });

  await actionItem.save();
  res.redirect(`/${orgName}/actionItems`);
});

//Show detail of each Action Item
router.get('/:id', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;

  const item = await ActionItem.findById(id)
    .populate('assignedTo assignedBy createdBy cycle objectiveId keyResultId parent')
    .lean();

  if (!item) {
    req.flash('error', 'Action Item not found');
    return res.redirect(`/${orgName}/actionItems`);
  }

  res.render('actionItems/show', { orgName, item });
});

// Edit
router.get('/:id/edit', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;
  const item = await ActionItem.findById(id);
  if (!item) return res.redirect(`/${orgName}/actionItems`);

  const users = await User.find({ organization: req.user.organization });
  const cycles = await OKRCycle.find({ isEnabled: true });
  const objectives = await Objective.find({ organization: req.user.organization });
  const keyResults = await KeyResult.find({ organization: req.user.organization });
  const actionItems = await ActionItem.find({ organization: req.user.organization, _id: { $ne: id } });
  const initiatives = await Initiative.find({ organization: req.user.organization });

  res.render('actionItems/edit', {
    orgName,
    item,
    users,
    cycles,
    objectives,
    keyResults,
    actionItems,
    initiatives
  });
});

// Update
router.put('/:id', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;
  const { title, description, assignedTo, cycle, dueDate, meeting, status, updateText } = req.body;
  const { initiativeId } = req.body;

  const actionItem = await ActionItem.findById(id);
  if (!actionItem) {
    req.flash('error', 'Action Item not found');
    return res.redirect(`/${orgName}/actionItems`);
  }

  actionItem.createdBy = actionItem.createdBy || req.user._id;
  actionItem.initiativeId = initiativeId || null;

  const updates = [];

  // Compare and track due date changes
  const oldDueDate = actionItem.dueDate ? new Date(actionItem.dueDate).toDateString() : null;
  const newDueDate = dueDate ? new Date(dueDate).toDateString() : null;
  if (oldDueDate !== newDueDate) {
    updates.push({ updateText: `Due date changed from ${oldDueDate || 'None'} to ${newDueDate || 'None'}` });
  }

  // Compare and track status changes
  if (actionItem.status !== status) {
    updates.push({ updateText: `Status changed from ${actionItem.status || 'Not Started'} to ${status}` });
  }

  // Add manual update text
  if (updateText && updateText.trim() !== '') {
    updates.push({ updateText: updateText.trim() });
  }

  // Update main fields
  actionItem.title = title;
  actionItem.description = description;
  actionItem.assignedTo = assignedTo;
  actionItem.cycle = cycle;
  actionItem.dueDate = dueDate;
  actionItem.meeting = meeting;
  actionItem.status = status;
  actionItem.updatedAt = new Date();

  // Append new updates to the updates array
  actionItem.updates.push(...updates);

  await actionItem.save();
  req.flash('success', 'Action Item updated successfully');
  res.redirect(`/${orgName}/actionItems`);
});

// Delete
router.delete('/:id', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;
  await ActionItem.findByIdAndDelete(id);
  res.redirect(`/${orgName}/actionItems`);
});

module.exports = router;

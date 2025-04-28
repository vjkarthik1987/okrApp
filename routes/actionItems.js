const express = require('express');
const router = express.Router({ mergeParams: true });
const ActionItem = require('../models/ActionItem');
const User = require('../models/User');
const OKRCycle = require('../models/OKRCycle');
const Objective = require('../models/Objective');
const KeyResult = require('../models/KeyResult');
const { isLoggedIn } = require('../middleware/auth');
const Initiative = require('../models/Initiative');

// Helper function to get all reportees recursively
async function getAllReportees(userId) {
  const directReports = await User.find({ manager: userId, isActive: true }).select('_id').lean();
  let all = [...directReports];

  for (let dr of directReports) {
    const subReports = await getAllReportees(dr._id);
    all = all.concat(subReports);
  }

  return all.map(u => u._id);
}

// Helper to recursively collect reportee IDs up to a certain depth
async function collectReporteeIds(userId, maxLevel = 3, currentLevel = 1) {
  if (currentLevel > maxLevel) return [];

  const reportees = await User.find({ manager: userId }, '_id');
  let ids = reportees.map(r => r._id);

  for (const reportee of reportees) {
    const childIds = await collectReporteeIds(reportee._id, maxLevel, currentLevel + 1);
    ids = ids.concat(childIds);
  }

  return ids;
}

// GET Action Items with scope (my/team/org)
router.get('/', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const scope = req.query.scope || 'my'; // my/team/org
  const page = parseInt(req.query.page) || 1;
  const pageSize = 25;
  const filter = req.query.filter || 'pending'; // pending/completed/all
  const level = parseInt(req.query.level) || 3;

  try {
    let userIds = [req.user._id]; // default: only my items

    if (scope === 'team') {
      const reporteeIds = await collectReporteeIds(req.user._id, level);
      userIds = [req.user._id, ...reporteeIds];
    } else if (scope === 'org' && req.user.isSuperAdmin) {
      userIds = []; // no filter on user
    }

    // Build query
    const query = {
      organization: req.user.organization
    };

    if (userIds.length > 0) {
      query.assignedTo = { $in: userIds };
    }

    if (filter === 'pending') {
      query.status = { $nin: ['Completed'] };
    } else if (filter === 'completed') {
      query.status = 'Completed';
    }
    // else 'all' - no status filter

    const totalCount = await ActionItem.countDocuments(query);

    const actionItems = await ActionItem.find(query)
      .populate('assignedTo cycle parent')
      .sort({ dueDate: 1 }) // nearest due date first
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const totalPages = Math.ceil(totalCount / pageSize);

    res.render('actionItems/index', {
      orgName,
      actionItems,
      page,
      totalPages,
      scope,
      filter,
      level
    });

  } catch (err) {
    console.error('Error loading Action Items:', err);
    req.flash('error', 'Failed to load Action Items');
    res.redirect(`/${orgName}/dashboard`);
  }
});

// New Action Item
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

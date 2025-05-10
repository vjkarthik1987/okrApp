const express = require('express');
const router = express.Router({ mergeParams: true });
const ActionItem = require('../models/ActionItem');
const User = require('../models/User');
const OKRCycle = require('../models/OKRCycle');
const Objective = require('../models/Objective');
const KeyResult = require('../models/KeyResult');
const { isLoggedIn } = require('../middleware/auth');
const Initiative = require('../models/Initiative');
const fs = require('fs');
const csvParser = require('csv-parser');
const dayjs = require('dayjs');
const upload = require('../middleware/uploadFile');
const { distance } = require('fastest-levenshtein');
const sendActionItemNotification = require('../utils/sendActionItemEmail');
const Team = require('../models/Team');


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
  const teams = await Team.find({ organization: req.user.organization });

  res.render('actionItems/new', {
    orgName,
    users,
    cycles,
    objectives,
    keyResults,
    actionItems,
    initiatives,
    preselectedInitiativeId: initiativeId || null,
    teams,
  });
});

// Create (web form)
router.post('/', isLoggedIn, upload.single('csvUsers'), async (req, res) => {
  const { orgName } = req.params;
  const {
    title, description, cycle, dueDate, meeting, objectiveId, keyResultId,
    initiativeId, parent, assignedTo, bulkAssignmentData,
    recurrenceType, recurrenceEndDate, sendEmail
  } = req.body;

  const isBulk = !!bulkAssignmentData;
  const createdBy = req.user._id;
  const organization = req.user.organization;
  let assignees = [];

  try {
    const isSuperAdmin = req.user.isSuperAdmin;
    const isFunctionHead = await Team.exists({
      organization,
      functionHead: req.user._id
    });

    // 🔍 Resolve assignees
    if (!isBulk) {
      if (!assignedTo) throw new Error('No user selected');
      assignees = [assignedTo];
    } else {
      const parsed = JSON.parse(bulkAssignmentData);
      const mode = parsed.mode;
      const targetIds = parsed.targetIds || [];

      if (mode === 'organization') {
        if (!isSuperAdmin && !isFunctionHead) {
          req.flash('error', 'Only Super Admins or Function Heads can assign to all employees.');
          return res.redirect(`/${orgName}/actionItems/new`);
        }

        const users = await User.find({ organization, isActive: true });
        assignees = users.map(u => u._id);

      } else if (mode === 'teams') {
        const users = await User.find({ team: { $in: targetIds }, organization, isActive: true });
        assignees = users.map(u => u._id);

      } else if (mode === 'users') {
        assignees = targetIds;

      } else if (mode === 'csv') {
        const users = await User.find({ organization });
        const teams = await Team.find({ organization });
        const teamMap = Object.fromEntries(teams.map(t => [t.name.toLowerCase().trim(), t._id.toString()]));

        const matches = [];
        await new Promise((resolve, reject) => {
          fs.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', row => {
              const name = row.Name?.toLowerCase().trim();
              const teamName = row.Team?.toLowerCase().trim();
              const teamId = teamMap[teamName];
              const match = users.find(u =>
                u.name?.toLowerCase().includes(name) &&
                (!teamId || u.team?.toString() === teamId)
              );
              if (match) matches.push(match._id);
            })
            .on('end', () => {
              fs.unlinkSync(req.file.path);
              assignees = matches;
              resolve();
            })
            .on('error', reject);
        });
      }
    }

    if (assignees.length === 0) {
      req.flash('error', 'No valid assignees found.');
      return res.redirect(`/${orgName}/actionItems/new`);
    }

    // 🔁 Recurrence logic
    const due = dayjs(dueDate);
    let dueDates = [due.toDate()];

    function generateDueDates(start, end, type) {
      const dates = [];
      let current = dayjs(start);
      const final = dayjs(end);
      while (current.isSame(final) || current.isBefore(final)) {
        dates.push(current.toDate());
        if (type === 'Weekly') current = current.add(1, 'week');
        else if (type === 'Fortnightly') current = current.add(2, 'week');
        else if (type === 'Monthly') current = current.add(1, 'month');
        else if (type === 'Quarterly') current = current.add(3, 'month');
        else break;
      }
      return dates;
    }

    if (recurrenceType && recurrenceType !== 'None' && recurrenceEndDate) {
      dueDates = generateDueDates(dueDate, recurrenceEndDate, recurrenceType);
    }

    // 🏗️ Build action items
    const itemsToCreate = [];

    for (let userId of assignees) {
      for (let d of dueDates) {
        itemsToCreate.push({
          title,
          description,
          assignedTo: userId,
          assignedBy: req.user._id,
          createdBy,
          organization,
          cycle,
          dueDate: d,
          meeting,
          objectiveId: objectiveId || null,
          keyResultId: keyResultId || null,
          initiativeId: initiativeId || null,
          parent: parent || null,
          status: 'Not Started'
        });
      }
    }

    const createdItems = await ActionItem.insertMany(itemsToCreate);

    // 📧 Optional email notifications
    const shouldSendEmail = sendEmail === 'on';
    if (shouldSendEmail) {
      const usersMap = await User.find({ _id: { $in: assignees } }).then(users =>
        Object.fromEntries(users.map(u => [u._id.toString(), u]))
      );

      for (let item of createdItems) {
        const assignedToUser = usersMap[item.assignedTo.toString()];
        if (assignedToUser) {
          sendActionItemNotification({
            actionItem: item,
            assignedToUser,
            createdByUser: req.user
          });
        }
      }
    }

    req.flash('success', `Created ${itemsToCreate.length} action items.`);
    res.redirect(`/${orgName}/actionItems`);
  } catch (err) {
    console.error('Action Item creation failed:', err);
    req.flash('error', err.message || 'Something went wrong.');
    res.redirect(`/${orgName}/actionItems/new`);
  }
});

// Create bulk action items
router.post('/upload', isLoggedIn, upload.single('csvFile'), async (req, res) => {
  const { orgName } = req.params;

  const users = await User.find({ organization: req.user.organization });
  const objectives = await Objective.find({ organization: req.user.organization });
  const keyResults = await KeyResult.find({ organization: req.user.organization });
  const initiatives = await Initiative.find({ organization: req.user.organization });
  const actionItems = await ActionItem.find({ organization: req.user.organization });
  const cycles = await OKRCycle.find({ organization: req.user.organization });

  const cycleMap = Object.fromEntries(cycles.map(c => [c.label?.toLowerCase(), c._id]));
  const results = [];
  const errors = [];
  const promises = [];

  function normalize(str) {
    return str?.toLowerCase().replace(/\s+/g, '').trim();
  }

  function findUser(inputName) {
    if (!inputName) return null;
  
    const inputTokens = normalize(inputName).split(/\s+/);
    let bestMatch = null;
    let bestScore = 0;
  
    for (const user of users) {
      const userTokens = normalize(user.name).split(/\s+/);
  
      let matchCount = 0;
      for (const token of inputTokens) {
        if (userTokens.some(t => t.startsWith(token) || distance(token, t) <= 1)) {
          matchCount++;
        }
      }
  
      const score = matchCount / inputTokens.length;
  
      if (score > bestScore && score >= 0.6) { // You can adjust this threshold
        bestScore = score;
        bestMatch = user;
      }
    }
  
    return bestMatch;
  }

  function findBestMatch(title, list) {
    if (!title) return null;
    const input = normalize(title);
    return list.find(i => normalize(i.title).startsWith(input)) ||
           list.find(i => normalize(i.title).includes(input)) || null;
  }

  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on('data', (row) => {
      promises.push((async () => {
        try {
          const assignedUser = findUser(row.assignedTo);
          if (!assignedUser) throw new Error(`Could not find user: ${row.assignedTo}`);

          const cycleId = row.cycleLabel ? cycleMap[row.cycleLabel.toLowerCase()] : null;
          const dueDate = dayjs(row['dueDate (DD-MM-YYYY)'], 'DD-MM-YYYY', true).isValid()
            ? dayjs(row['dueDate (DD-MM-YYYY)'], 'DD-MM-YYYY').toDate()
            : null;

          const objective = findBestMatch(row.objectiveTitle, objectives);
          const kr = findBestMatch(row.keyResultTitle, keyResults);
          const initiative = findBestMatch(row.initiativeTitle, initiatives);
          const parent = findBestMatch(row.parentTitle, actionItems);

          const actionItem = new ActionItem({
            title: row.title,
            description: row.description || '',
            assignedTo: assignedUser._id,
            assignedBy: req.user._id,
            createdBy: req.user._id,
            dueDate,
            meeting: row.meeting || '',
            status: 'Not Started',
            objectiveId: objective?._id || null,
            keyResultId: kr?._id || null,
            initiativeId: initiative?._id || null,
            parent: parent?._id || null,
            organization: req.user.organization,
            cycle: cycleId || null
          });

          await actionItem.save();
          await sendActionItemNotification({
            actionItem,
            assignedToUser: assignedUser,
            createdByUser: req.user
          });

          results.push({ title: row.title, status: '✅ Success' });
        } catch (err) {
          errors.push({ title: row.title || 'Unknown', error: err.message });
        }
      })());
    })
    .on('end', async () => {
      await Promise.all(promises);
      fs.unlinkSync(req.file.path);
      res.render('actionItems/uploadResult', { orgName, results, errors });
    });
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

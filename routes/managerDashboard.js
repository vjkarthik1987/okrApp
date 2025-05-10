const express = require('express');
const router = express.Router({ mergeParams: true });
const User = require('../models/User');
const ActionItem = require('../models/ActionItem');
const WeekCycle = require('../models/WeekCycle');
const DiaryEntry = require('../models/DiaryEntry');
const { isLoggedIn } = require('../middleware/auth');
const { isManager } = require('../middleware/checkRoles');

// 🧠 Build user → reportees hierarchy
function buildUserHierarchyMap(users) {
  const map = {};
  users.forEach(u => (map[u._id.toString()] = { ...u, reportees: [] }));
  users.forEach(u => {
    if (u.manager && u._id.toString() !== u.manager.toString()) {
      map[u.manager.toString()]?.reportees.push(u);
    }
  });
  return map;
}

// 🔁 Recursive team lookup
function getReportees(managerId, userMap, depth = 0, max = 8) {
  if (max && depth >= max) return [];
  const direct = userMap[managerId]?.reportees || [];
  return direct.flatMap(r => [r._id, ...getReportees(r._id.toString(), userMap, depth + 1, max)]);
}

router.get('/', isLoggedIn, isManager, async (req, res) => {
  const {
    maxDepth,
    view = 'self',
    status,
    weekCycleId,
    aiPage = 1,
    aiLimit = 10,
    diaryPage = 1,
    diarySize = 5
  } = req.query;

  const orgId = req.organization._id;
  const userId = req.user._id;

  const allUsers = await User.find({ organization: orgId, isActive: true }).lean();
  const userMap = buildUserHierarchyMap(allUsers);
  const teamTree = userMap[userId.toString()]?.reportees || [];
  const teamUserIds = getReportees(userId.toString(), userMap, 0, maxDepth ? parseInt(maxDepth) : 8);
  const directUserIds = userMap[userId.toString()]?.reportees.map(r => r._id) || [];

  // 📋 Action Items
  const actionQuery = { organization: orgId };
  if (view === 'self') actionQuery.assignedTo = userId;
  else if (view === 'direct') actionQuery.assignedTo = { $in: directUserIds };
  else if (view === 'team') actionQuery.assignedTo = { $in: teamUserIds };
  if (status && status !== 'all') {
    actionQuery.status = status === 'pending' ? { $nin: ['Completed'] } : status;
  }

  const totalActionItems = await ActionItem.countDocuments(actionQuery);
  const myActionItems = await ActionItem.find(actionQuery)
    .populate('assignedTo', 'name email')
    .sort({ dueDate: 1 })
    .skip((parseInt(aiPage) - 1) * parseInt(aiLimit))
    .limit(parseInt(aiLimit))
    .lean();
  const aiTotalPages = Math.ceil(totalActionItems / parseInt(aiLimit));

  // 📓 Week Cycles
  const today = new Date();
  const weeks = await WeekCycle.find({
    weekEnd: { $lte: new Date(today.getTime() + 7 * 86400000) },
    weekStart: { $gte: new Date(today.getTime() - 90 * 86400000) }
  }).sort({ weekStart: -1 }).lean();

  // 📓 Diary Entries for selected week
  let diaryEntries = [];
  let diaryTotalPages = 1;
  if (weekCycleId) {
    const totalDiaryEntries = await DiaryEntry.countDocuments({
      user: { $in: teamUserIds },
      organization: orgId,
      weekCycle: weekCycleId
    });

    diaryTotalPages = Math.ceil(totalDiaryEntries / parseInt(diarySize));

    diaryEntries = await DiaryEntry.find({
      user: { $in: teamUserIds },
      organization: orgId,
      weekCycle: weekCycleId
    })
      .populate('user')
      .sort({ createdAt: -1 })
      .skip((parseInt(diaryPage) - 1) * parseInt(diarySize))
      .limit(parseInt(diarySize))
      .lean();
  }

  // 🕒 Recent Diary Entries (last 4 weeks)
  const recentDiaryEntries = await DiaryEntry.find({
    user: { $in: [...teamUserIds, userId] },
    organization: orgId,
    date: { $gte: new Date(today.getTime() - 28 * 86400000) }
  }).populate('user').sort({ createdAt: -1 }).lean();

  // 💬 Recent Action Item Updates
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const actionItemsForUpdates = await ActionItem.find({
    assignedTo: { $in: teamUserIds },
    organization: orgId
  }).populate('assignedTo', 'name').lean();

  const chatUpdates = [];
  actionItemsForUpdates.forEach(item => {
    if (item.updates?.length) {
      item.updates.forEach(update => {
        if (update.updateDate >= fourWeeksAgo) {
          chatUpdates.push({
            type: 'action',
            actionItemTitle: item.title,
            updatedBy: item.assignedTo?.name || 'Unknown',
            updateText: update.updateText,
            updateDate: update.updateDate
          });
        }
      });
    }
  });

  // Merge all updates for feed
  const allUpdates = [
    ...chatUpdates,
    ...recentDiaryEntries.map(e => ({
      type: 'diary',
      user: e.user.name,
      content: e.content,
      date: e.createdAt
    }))
  ].sort((a, b) => new Date(b.date || b.updateDate) - new Date(a.date || a.updateDate));

  const viewLabelMap = { self: 'My Items', direct: 'Direct Reports', team: 'Full Team' };

  res.render('managerDashboard/index', {
    orgName: req.organization.orgName,
    user: req.user,
    teamTree,
    maxDepth,
    view,
    viewLabel: viewLabelMap[view] || 'Team View',
    status,
    myActionItems,
    aiPage: parseInt(aiPage),
    aiTotalPages,
    weeks,
    diaryEntries,
    diaryPage: parseInt(diaryPage),
    diaryTotalPages,
    recentDiaryEntries,
    selectedWeekCycleId: weekCycleId,
    teamUserIds,
    userMap,
    allUpdates
  });
});

module.exports = router;

const express = require('express');
const router = express.Router({ mergeParams: true });
const User = require('../models/User');
const ActionItem = require('../models/ActionItem');
const WeekCycle = require('../models/WeekCycle');
const DiaryEntry = require('../models/DiaryEntry');
const { isLoggedIn } = require('../middleware/auth');
const { isManager } = require('../middleware/checkRoles');

router.get('/', isLoggedIn, isManager, async (req, res) => {
    try {
        const allUsers = await User.find({
        organization: req.organization._id,
        isActive: true
        }).lean();

        const userMap = {};
        allUsers.forEach(user => {
        user.reportees = [];
        userMap[user._id.toString()] = user;
        });

        allUsers.forEach(user => {
        if (user.manager && user._id.toString() !== user.manager.toString()) {
            const manager = userMap[user.manager.toString()];
            if (manager) {
            manager.reportees.push(user);
            }
        }
        });

        const teamTree = userMap[req.user._id.toString()]?.reportees || [];
        const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth) : null;

        res.render('managerDashboard/index', {
        orgName: req.organization.orgName,
        user: req.user,
        teamTree,
        maxDepth
        });

    } catch (err) {
        console.error('Error loading Manager Dashboard:', err);
        req.flash('error', 'Failed to load Manager Dashboard.');
        res.redirect(`/${req.organization.orgName}/dashboard`);
    }
});

router.get('/team-action-items', isLoggedIn, isManager, async (req, res) => {
    try {
        const allUsers = await User.find({
        organization: req.organization._id,
        isActive: true
        }).lean();

        // Build userMap for fast lookup
        const userMap = {};
        allUsers.forEach(user => {
        user.reportees = [];
        userMap[user._id.toString()] = user;
        });

        allUsers.forEach(user => {
        if (user.manager && user._id.toString() !== user.manager.toString()) {
            const manager = userMap[user.manager.toString()];
            if (manager) {
            manager.reportees.push(user);
            }
        }
        });

        // Get all reportee userIds (recursive, all levels)
        const getAllReportees = (managerId) => {
        const directReportees = userMap[managerId]?.reportees || [];
        let all = [];
        for (const reportee of directReportees) {
            all.push(reportee._id);
            all = all.concat(getAllReportees(reportee._id.toString()));
        }
        return all;
        };

        const teamUserIds = getAllReportees(req.user._id.toString());

        // Fetch Action Items assigned to anyone under manager
        const actionItems = await ActionItem.find({
        assignedTo: { $in: teamUserIds },
        organization: req.organization._id
        })
        .populate('assignedTo', 'name email') // Only pick name/email
        .lean();

        // Fetch Action Item updates for chat (only updates in last 4 weeks)
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

        // We'll pull updates inside action items itself (each actionItem.updates array)
        const chatUpdates = [];
        for (const item of actionItems) {
        if (item.updates && item.updates.length > 0) {
            item.updates.forEach(update => {
            if (update.updateDate >= fourWeeksAgo) {
                chatUpdates.push({
                actionItemTitle: item.title,
                updatedBy: item.assignedTo?.name || 'Unknown',
                updateText: update.updateText,
                updateDate: update.updateDate
                });
            }
            });
        }
        }

        // Calculate summary
        const pendingCount = actionItems.filter(ai => ai.status !== 'Completed').length;
        const completedCount = actionItems.filter(ai => ai.status === 'Completed').length;
        const overdueCount = actionItems.filter(ai => {
        const due = new Date(ai.dueDate);
        const now = new Date();
        return ai.status !== 'Completed' && due < now;
        }).length;

        res.render('managerDashboard/teamActionItems', {
        orgName: req.organization.orgName,
        user: req.user,
        actionItems,
        chatUpdates,
        pendingCount,
        completedCount,
        overdueCount
        });

    } catch (err) {
        console.error('Error loading Team Action Items:', err);
        req.flash('error', 'Failed to load Team Action Items.');
        res.redirect(`/${req.organization.orgName}/dashboard`);
    }
});

// View Action Item Details
router.get('/action-items/:id', isLoggedIn, isManager, async (req, res) => {
  try {
    const { orgName } = req.params;
    const actionItem = await ActionItem.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('assignedTo assignedBy createdBy objectiveId keyResultId cycle initiativeId')
      .lean();

    if (!actionItem) {
      req.flash('error', 'Action Item not found');
      return res.redirect(`/${orgName}/manager-dashboard/team-action-items`);
    }

    res.render('managerDashboard/actionItemDetails', { orgName, item: actionItem });
  } catch (err) {
    console.error('Error fetching action item details:', err);
    req.flash('error', 'Internal server error');
    res.redirect(`/${req.params.orgName}/manager-dashboard/team-action-items`);
  }
});

// POST: Add a comment + optional status update to ActionItem
router.post('/action-items/:id/comment', isLoggedIn, isManager, async (req, res) => {
  try {
    const { commentText, newStatus } = req.body;
    const actionItemId = req.params.id;

    // Fetch Action Item
    const actionItem = await ActionItem.findOne({
      _id: actionItemId,
      organization: req.organization._id
    });

    if (!actionItem) {
      req.flash('error', 'Action Item not found.');
      return res.redirect(`/${req.organization.orgName}/manager-dashboard/team-action-items`);
    }

    // Security Check: Manager should be in reporting line
    // (Get all team member IDs)
    const allUsers = await User.find({ organization: req.organization._id, isActive: true }).lean();
    const userMap = {};
    allUsers.forEach(u => { userMap[u._id.toString()] = u; });

    const getAllReportees = (managerId) => {
      const directReportees = allUsers.filter(u => u.manager && u.manager.toString() === managerId);
      let all = [];
      for (const r of directReportees) {
        all.push(r._id.toString());
        all = all.concat(getAllReportees(r._id.toString()));
      }
      return all;
    };

    const teamUserIds = getAllReportees(req.user._id.toString());

    if (!teamUserIds.includes(actionItem.assignedTo.toString())) {
      req.flash('error', 'You are not authorized to comment on this Action Item.');
      return res.redirect(`/${req.organization.orgName}/manager-dashboard/team-action-items`);
    }

    // Build new comment entry
    const newComment = {
      commenter: req.user._id,
      commentText: commentText,
      commentDate: new Date(),
      newStatus: newStatus || null
    };

    // Push comment into array
    actionItem.comments.push(newComment);

    // Update status if provided
    if (newStatus && newStatus !== actionItem.status) {
      actionItem.status = newStatus;
      
      // If marked Completed, set closureDate
      if (newStatus === 'Completed') {
        actionItem.closureDate = new Date();
      }
    }

    await actionItem.save();

    req.flash('success', 'Comment added successfully.');
    res.redirect(`/${req.organization.orgName}/manager-dashboard/team-action-items`);

  } catch (err) {
    console.error('Error adding comment to ActionItem:', err);
    req.flash('error', 'Failed to add comment.');
    res.redirect(`/${req.organization.orgName}/manager-dashboard/team-action-items`);
  }
});

// 📓 View Team Diary Entries
router.get('/team-diary-entries', isLoggedIn, isManager, async (req, res) => {
  try {
    const { orgName } = req.params;
    const selectedWeekCycleId = req.query.weekCycleId || null;

    const allUsers = await User.find({
      organization: req.organization._id,
      isActive: true
    }).lean();

    const userMap = {};
    allUsers.forEach(user => {
      user.reportees = [];
      userMap[user._id.toString()] = user;
    });

    allUsers.forEach(user => {
      if (user.manager && user._id.toString() !== user.manager.toString()) {
        const manager = userMap[user.manager.toString()];
        if (manager) {
          manager.reportees.push(user);
        }
      }
    });

    const getAllReportees = (managerId) => {
      const directReportees = userMap[managerId]?.reportees || [];
      let all = [];
      for (const reportee of directReportees) {
        all.push(reportee._id);
        all = all.concat(getAllReportees(reportee._id.toString()));
      }
      return all;
    };

    const teamUserIds = getAllReportees(req.user._id.toString());

    const today = new Date();
    const weeks = await WeekCycle.find({
      weekEnd: { $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) },
      weekStart: { $gte: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000) }
    }).sort({ weekStart: -1 }).lean();

    let diaryEntries = [];
    if (selectedWeekCycleId) {
      diaryEntries = await DiaryEntry.find({
        user: { $in: teamUserIds },
        organization: req.organization._id,
        weekCycle: selectedWeekCycleId
      }).populate('user').lean();
    }

    // Compliance Data Calculation
    const complianceData = [];
    for (const week of weeks) {
      const entries = await DiaryEntry.find({
        user: { $in: teamUserIds },
        organization: req.organization._id,
        weekCycle: week._id
      }).lean();

      const submittedCount = entries.length;
      const totalCount = teamUserIds.length;
      const compliancePercent = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;

      complianceData.push({
        weekLabel: week.label,
        compliancePercent
      });
    }

    // Recent Diary Entries (Last 4 Weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const recentDiaryEntries = await DiaryEntry.find({
      user: { $in: teamUserIds },
      organization: req.organization._id,
      date: { $gte: fourWeeksAgo }
    })
      .populate('user')
      .sort({ createdAt: -1 })
      .lean();

    res.render('managerDashboard/teamDiaryEntries', {
      orgName: req.organization.orgName,
      user: req.user,
      weeks,
      diaryEntries,
      recentDiaryEntries,
      teamUserIds,
      selectedWeekCycleId,
      complianceData,
      userMap
    });

  } catch (err) {
    console.error('Error loading Team Diary Entries:', err);
    req.flash('error', 'Failed to load Team Diary Entries.');
    res.redirect(`/${req.organization.orgName}/dashboard`);
  }
});

// 📥 Download Team Diary Entries as CSV
router.get('/team-diary-entries/download-csv', isLoggedIn, isManager, async (req, res) => {
  try {
    const { orgName } = req.params;
    const { weekCycleId } = req.query;

    if (!weekCycleId) {
      req.flash('error', 'Week not selected.');
      return res.redirect(`/${orgName}/manager-dashboard/team-diary-entries`);
    }

    const allUsers = await User.find({
      organization: req.organization._id,
      isActive: true
    }).lean();

    const userMap = {};
    allUsers.forEach(user => {
      userMap[user._id.toString()] = user;
    });

    const getAllReportees = (managerId) => {
      const directReportees = allUsers.filter(u => u.manager && u.manager.toString() === managerId);
      let all = [];
      for (const r of directReportees) {
        all.push(r._id.toString());
        all = all.concat(getAllReportees(r._id.toString()));
      }
      return all;
    };

    const teamUserIds = getAllReportees(req.user._id.toString());

    const diaryEntries = await DiaryEntry.find({
      user: { $in: teamUserIds },
      organization: req.organization._id,
      weekCycle: weekCycleId
    }).populate('user').lean();

    let csvContent = 'Employee Name,Employee Email,Diary Content\n';

    teamUserIds.forEach(userId => {
      const entry = diaryEntries.find(e => e.user._id.toString() === userId);
      const name = entry ? (entry.user.name || '') : (userMap[userId]?.name || '');
      const email = entry ? (entry.user.email || '') : (userMap[userId]?.email || '');
      const content = entry ? (entry.content || 'No Submission') : 'No Submission';

      csvContent += `"${name}","${email}","${content.replace(/"/g, '""')}"\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('team-diary-entries.csv');
    return res.send(csvContent);

  } catch (err) {
    console.error('Error generating CSV:', err);
    req.flash('error', 'Failed to generate CSV.');
    res.redirect(`/${req.organization.orgName}/manager-dashboard/team-diary-entries`);
  }
});

module.exports = router;
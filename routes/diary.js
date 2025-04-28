const express = require('express');
const router = express.Router({ mergeParams: true });
const DiaryEntry = require('../models/DiaryEntry');
const WeekCycle = require('../models/WeekCycle');
const Organization = require('../models/Organization');
const User = require('../models/User');
const { isLoggedIn } = require('../middleware/auth');

// Helper: Recursively fetch all reportees
async function collectReporteeIds(userId, maxLevel = 3, currentLevel = 1) {
  if (currentLevel > maxLevel) return [];

  const reportees = await User.find({ manager: userId, isActive: true }).select('_id');
  let ids = reportees.map(r => r._id);

  for (const reportee of reportees) {
    const childIds = await collectReporteeIds(reportee._id, maxLevel, currentLevel + 1);
    ids = ids.concat(childIds);
  }

  return ids;
}

// 📚 View Diary Entries with scopes (my/team/org)
router.get('/', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const scope = req.query.scope || 'my'; // my/team/org
  const weeksFilter = parseInt(req.query.weeks) || 4; // 4/8/All (default 4 weeks)
  const level = parseInt(req.query.level) || 3; // team reporting depth

  try {
    let userIds = [req.user._id]; // default: only self

    if (scope === 'team') {
      const reporteeIds = await collectReporteeIds(req.user._id, level);
      userIds = [req.user._id, ...reporteeIds];
    } else if (scope === 'org' && req.user.isSuperAdmin) {
      userIds = []; // no user filter for org
    }

    const query = {
      organization: req.user.organization
    };

    if (userIds.length > 0) {
      query.user = { $in: userIds };
    }

    if (weeksFilter !== 'all') {
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - (weeksFilter * 7));
      query.date = { $gte: dateThreshold };
    }

    const entries = await DiaryEntry.find(query)
      .populate('user weekCycle')
      .sort({ date: -1 })
      .lean();

    res.render('diary/index', {
      orgName,
      entries,
      scope,
      weeksFilter,
      level,
      user: req.user
    });

  } catch (err) {
    console.error('Error loading diary entries:', err);
    req.flash('error', 'Failed to load diary entries.');
    res.redirect(`/${orgName}/dashboard`);
  }
});

// 🆕 Form to add new diary entry
router.get('/new', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const today = new Date();

  const org = await Organization.findOne({ orgName: orgName });
  if (!org) {
    req.flash('error', 'Organization not found');
    return res.redirect('/');
  }

  const currentWeek = await WeekCycle.findOne({
    weekStart: { $lte: today },
    weekEnd: { $gte: today },
  });

  if (!currentWeek) {
    req.flash('error', 'No WeekCycle found for today');
    return res.redirect(`/${orgName}/diary`);
  }

  const weeks = await WeekCycle.find({
    cycle: currentWeek.cycle,
    weekStart: { $lte: new Date(currentWeek.weekEnd.getTime() + 14 * 24 * 60 * 60 * 1000) },
    weekEnd: { $gte: new Date(currentWeek.weekStart.getTime() - 28 * 24 * 60 * 60 * 1000) },
  }).sort({ weekStart: 1 });

  const diaryCounts = {};
  for (let week of weeks) {
    const count = await DiaryEntry.countDocuments({
      user: req.user._id,
      weekCycle: week._id,
      organization: req.user.organization
    });
    diaryCounts[week._id] = count;
  }

  res.render('diary/new', { orgName, weeks, diaryCounts });
});

// ➕ Create diary entry
router.post('/', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const { content, weekCycleId } = req.body;

  const org = await Organization.findOne({ orgName: orgName });
  if (!org || !req.user.organization.equals(org._id)) {
    req.flash('error', 'Invalid organization.');
    return res.redirect('/');
  }

  const weekCycle = await WeekCycle.findById(weekCycleId);
  if (!weekCycle) {
    req.flash('error', 'Invalid WeekCycle selected.');
    return res.redirect(`/${orgName}/diary/new`);
  }

  const entry = new DiaryEntry({
    user: req.user._id,
    organization: org._id,
    weekCycle: weekCycle._id,
    date: new Date(),
    content
  });

  await entry.save();
  req.flash('success', 'Diary entry added.');
  res.redirect(`/${orgName}/diary`);
});

// ✏️ Edit diary entry form
router.get('/:id/edit', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;

  const entry = await DiaryEntry.findById(id).populate('weekCycle');

  if (
    !entry ||
    !entry.user.equals(req.user._id) ||
    !entry.organization.equals(req.user.organization)
  ) {
    req.flash('error', 'Not authorized.');
    return res.redirect(`/${orgName}/diary`);
  }

  const weeks = entry.weekCycle?.cycle
    ? await WeekCycle.find({ cycle: entry.weekCycle.cycle }).sort({ weekStart: 1 })
    : [];

  res.render('diary/edit', { orgName, entry, weeks });
});

// 📝 Update diary entry
router.put('/:id', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;
  const { content, weekCycleId } = req.body;

  const entry = await DiaryEntry.findById(id);

  if (
    !entry ||
    !entry.user.equals(req.user._id) ||
    !entry.organization.equals(req.user.organization)
  ) {
    req.flash('error', 'Not authorized.');
    return res.redirect(`/${orgName}/diary`);
  }

  entry.content = content;
  entry.weekCycle = weekCycleId;
  entry.updatedAt = Date.now();
  await entry.save();

  req.flash('success', 'Diary entry updated.');
  res.redirect(`/${orgName}/diary`);
});

// 🗑 Delete diary entry
router.delete('/:id', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;
  const entry = await DiaryEntry.findById(id);

  if (
    !entry ||
    !entry.user.equals(req.user._id) ||
    !entry.organization.equals(req.user.organization)
  ) {
    req.flash('error', 'Not authorized.');
    return res.redirect(`/${orgName}/diary`);
  }

  await DiaryEntry.findByIdAndDelete(id);
  req.flash('success', 'Diary entry deleted.');
  res.redirect(`/${orgName}/diary`);
});

module.exports = router;
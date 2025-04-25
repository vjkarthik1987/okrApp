const express = require('express');
const router = express.Router({ mergeParams: true });
const DiaryEntry = require('../models/DiaryEntry');
const WeekCycle = require('../models/WeekCycle');
const Organization = require('../models/Organization');
const { isLoggedIn } = require('../middleware/auth');

// 📚 View all your diary entries (scoped to org)
router.get('/', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const entries = await DiaryEntry.find({
    user: req.user._id,
    organization: req.user.organization
  })
    .populate('weekCycle')
    .sort({ date: -1 });

  res.render('diary/index', { orgName, entries });
});

// 🆕 Form to add new diary entry (uses today's week)
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

  // 🔥 Find diary entries per week
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
    date: new Date(), // 👉 automatically set to now
    content
  });

  await entry.save();
  req.flash('success', 'Diary entry added.');
  res.redirect(`/${orgName}/diary`);
});


// ✏️ Edit form
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

  // Fetch all weeks from the same OKRCycle to allow switching
  const weeks = await WeekCycle.find({ cycle: entry.weekCycle.cycle }).sort({ weekStart: 1 });

  res.render('diary/edit', { orgName, entry, weeks });
});

// 📝 Update entry
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
  await entry.save();

  req.flash('success', 'Diary entry updated.');
  res.redirect(`/${orgName}/diary`);
});

// 🗑 Delete entry
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
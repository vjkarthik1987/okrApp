const express = require('express');
const router = express.Router({ mergeParams: true });
const WeekCycle = require('../models/WeekCycle');
const Organization = require('../models/Organization');
const OKRCycle = require('../models/OKRCycle');
const { isLoggedIn } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/checkRoles');

// 🧾 GET / – View all WeekCycles for admin
router.get('/', isLoggedIn, isSuperAdmin, async (req, res) => {
  const { orgName } = req.params;
  const cycles = await WeekCycle.find().populate('cycle').sort({ weekStart: 1 });
  res.render('admin/weekcycles/index', { orgName, cycles });
});

// 🆕 GET /generate – Show form to generate weekly cycles
router.get('/generate', isLoggedIn, isSuperAdmin, async (req, res) => {
    const { orgName } = req.params;
    console.log(orgName)

    // First get the org ID (assuming you have org name -> org lookup middleware, else do this):
    const org = await Organization.findOne({ orgName: orgName });
    console.log(org);

    if (!org) {
        req.flash('error', 'Organization not found.');
        return res.redirect('/');
    }

    // Filter OKRCycles for this org only
    const okrCycles = await OKRCycle.find({ organization: org._id }).sort({ label: 1 });

    res.render('admin/weekcycles/generate', {
        orgName,
        okrCycles,
      });
});
  

// ➕ POST /generate – Create WeekCycles
router.post('/generate', isLoggedIn, isSuperAdmin, async (req, res) => {
  const { orgName } = req.params;
  const { cycleId, startDate, numWeeks } = req.body;

  const weeks = [];
  let currentStart = new Date(startDate);

  for (let i = 0; i < Number(numWeeks); i++) {
    const weekStart = new Date(currentStart);
    const weekEnd = new Date(currentStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const label = `Week ${i + 1} - ${weekStart.toDateString().slice(4, 10)} to ${weekEnd.toDateString().slice(4, 10)}`;

    weeks.push({
      cycle: cycleId,
      weekStart,
      weekEnd,
      label,
    });

    currentStart.setDate(currentStart.getDate() + 7); // next Wednesday
  }

  await WeekCycle.insertMany(weeks);
  req.flash('success', `${weeks.length} WeekCycles generated successfully.`);
  res.redirect(`/${orgName}/admin/weekcycles`);
});

module.exports = router;

const express = require('express');
const router = express.Router({ mergeParams: true });
const { isSuperAdmin } = require('../middleware/checkRoles');
const OKRCycle = require('../models/OKRCycle');

// GET all cycles
router.get('/', isSuperAdmin, async (req, res) => {
  const cycles = await OKRCycle.find({ organization: req.organization._id }).sort({ label: 1 });
  res.render('admin/cycles/index', { orgName: req.organization.orgName, cycles });
});

// POST: Create new cycle
router.post('/', isSuperAdmin, async (req, res) => {
  const { cycleCode, year, quarter, isEnabled } = req.body;
  try {
    const newCycle = new Cycle({
      cycleCode,
      year,
      quarter,
      isEnabled,
      organization: req.organization._id
    });
    await newCycle.save();
    req.flash('success', 'Cycle added');
  } catch (err) {
    req.flash('error', 'Failed to add cycle');
  }
  res.redirect(`/${req.organization.orgName}/admin/cycles`);
});

// Toggle cycle enable/disable
router.post('/:id/toggle', isSuperAdmin, async (req, res) => {
  const cycle = await OKRCycle.findById(req.params.id);
  cycle.isEnabled = !cycle.isEnabled;
  await cycle.save();
  req.flash('success', `Cycle ${cycle.cycleCode} is now ${cycle.isEnabled ? 'enabled' : 'disabled'}`);
  res.redirect(`/${req.organization.orgName}/admin/cycles`);
});

// POST: Seed 4 quarters for a new year
router.post('/seed', isSuperAdmin, async (req, res) => {
  const { year } = req.body;

  if (!year || isNaN(year)) {
    req.flash('error', 'Invalid year');
    return res.redirect(`/${req.organization.orgName}/admin/cycles`);
  }

  try {
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

    for (let q of quarters) {
      const label = `${q}-${year}`;
      const exists = await OKRCycle.findOne({
        label,
        organization: req.organization._id
      });

      if (!exists) {
        const newCycle = new OKRCycle({
          label,
          type: 'quarter',
          isEnabled: false,
          organization: req.organization._id
        });

        await newCycle.save();
      }
    }

    // Optionally: add the year-level cycle as well
    const yearLabel = `${year}`;
    const yearExists = await OKRCycle.findOne({
      label: yearLabel,
      type: 'year',
      organization: req.organization._id
    });

    if (!yearExists) {
      await OKRCycle.create({
        label: yearLabel,
        type: 'year',
        isEnabled: false,
        organization: req.organization._id
      });
    }

    req.flash('success', `Created 4 quarters and year entry for ${year}`);
    res.redirect(`/${req.organization.orgName}/admin/cycles`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to seed quarters');
    res.redirect(`/${req.organization.orgName}/admin/cycles`);
  }
});


module.exports = router;

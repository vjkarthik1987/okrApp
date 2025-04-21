const express = require('express');
const router = express.Router({ mergeParams: true });
const { isSuperAdmin } = require('../middleware/checkRoles');
const OKRCycle = require('../models/OKRCycle');

// GET all cycles
router.get('/', isSuperAdmin, async (req, res) => {
  try {
    const cycles = await OKRCycle.find({ organization: req.organization._id }).sort({ label: 1 });
    res.render('admin/cycles/index', {
      orgName: req.organization.orgName,
      cycles
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load cycles');
    res.redirect(`/${req.organization.orgName}/dashboard`);
  }
});

// POST: Add full year (Q1-Q4 + Year)
router.post('/add-year', isSuperAdmin, async (req, res) => {
  const { year } = req.body;
  const orgId = req.organization._id;

  try {
    const existing = await OKRCycle.find({ organization: orgId, label: new RegExp(`-${year}$`) });
    if (existing.length > 0) {
      req.flash('error', `Year ${year} already exists`);
      return res.redirect(`/${req.organization.orgName}/admin/cycles`);
    }

    const cycles = [
      { label: `Q1-${year}`, type: 'quarter' },
      { label: `Q2-${year}`, type: 'quarter' },
      { label: `Q3-${year}`, type: 'quarter' },
      { label: `Q4-${year}`, type: 'quarter' },
      { label: `${year}`, type: 'year' }
    ];

    for (const cycle of cycles) {
      await OKRCycle.create({
        ...cycle,
        isEnabled: false,
        organization: orgId
      });
    }

    req.flash('success', `Year ${year} added with quarters`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add year');
  }

  res.redirect(`/${req.organization.orgName}/admin/cycles`);
});

// POST: Toggle enable/disable cycle
router.post('/:id/toggle', isSuperAdmin, async (req, res) => {
  try {
    const cycle = await OKRCycle.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!cycle) {
      req.flash('error', 'Cycle not found');
      return res.redirect(`/${req.organization.orgName}/admin/cycles`);
    }

    cycle.isEnabled = !cycle.isEnabled;
    await cycle.save();

    req.flash('success', `Cycle ${cycle.label} ${cycle.isEnabled ? 'enabled' : 'disabled'}`);
    res.redirect(`/${req.organization.orgName}/admin/cycles`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to toggle cycle');
    res.redirect(`/${req.organization.orgName}/admin/cycles`);
  }
});

module.exports = router;
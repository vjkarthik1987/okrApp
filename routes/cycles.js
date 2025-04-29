const express = require('express');
const router = express.Router({ mergeParams: true });
const { isSuperAdmin } = require('../middleware/checkRoles');
const OKRCycle = require('../models/OKRCycle');
const Organization = require('../models/Organization');

// Utility to generate startDate and endDate
function generateCycleDates(label, type, financialYearStartMonth) {
  const startDates = {
    1: ['01-01', '04-01', '07-01', '10-01'],  // January start
    4: ['04-01', '07-01', '10-01', '01-01'],  // April start
    7: ['07-01', '10-01', '01-01', '04-01']   // July start
    // (Can add more customizations if needed later)
  };

  const quarterDurations = {
    'Q1': 0,
    'Q2': 1,
    'Q3': 2,
    'Q4': 3
  };

  if (type === 'year') {
    const year = parseInt(label);
    let startYear = year;
    let endYear = (financialYearStartMonth === 1) ? year : year + 1;

    const startMonth = financialYearStartMonth.toString().padStart(2, '0');
    const startDate = new Date(`${startYear}-${startMonth}-01`);
    const endDate = new Date(new Date(`${endYear}-${startMonth}-01`).getTime() - 1); // Previous day

    return { startDate, endDate };
  } else if (type === 'quarter') {
    const [q, yearStr] = label.split('-');
    let year = parseInt(yearStr);
    const quarterIndex = quarterDurations[q];
  
    let startMonthIndex = ((financialYearStartMonth - 1) + quarterIndex * 3) % 12;
    let startYear = year;
    if (financialYearStartMonth !== 1 && startMonthIndex < (financialYearStartMonth - 1)) {
      startYear += 1; // cross over year
    }
    const startMonth = (startMonthIndex + 1).toString().padStart(2, '0');
  
    const startDate = new Date(`${startYear}-${startMonth}-01`);
  
    // 🛠 Correct End Date calculation
    const nextQuarterStart = new Date(startDate);
    nextQuarterStart.setMonth(nextQuarterStart.getMonth() + 3);
    nextQuarterStart.setDate(1);
    nextQuarterStart.setHours(0, 0, 0, 0);
  
    const endDate = new Date(nextQuarterStart.getTime() - 1);
  
    return { startDate, endDate };
  } else {
    throw new Error('Invalid OKR Cycle type.');
  }
}

// GET all cycles
router.get('/', isSuperAdmin, async (req, res) => {
  const cycles = await OKRCycle.find({ organization: req.organization._id }).sort({ label: 1 });
  res.render('admin/cycles/index', { orgName: req.organization.orgName, cycles });
});

// POST: Create new cycle (single)
router.post('/', isSuperAdmin, async (req, res) => {
  const { label, type, isEnabled } = req.body;

  try {
    const organization = await Organization.findById(req.organization._id);
    if (!organization) {
      req.flash('error', 'Organization not found.');
      return res.redirect(`/${req.organization.orgName}/admin/cycles`);
    }

    const { startDate, endDate } = generateCycleDates(label, type, organization.financialYearStartMonth);

    const newCycle = new OKRCycle({
      label,
      type,
      startDate,
      endDate,
      isEnabled: isEnabled || false,
      organization: req.organization._id
    });

    await newCycle.save();
    req.flash('success', 'Cycle added');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add cycle');
  }

  res.redirect(`/${req.organization.orgName}/admin/cycles`);
});

// Toggle cycle enable/disable
router.post('/:id/toggle', isSuperAdmin, async (req, res) => {
  const cycle = await OKRCycle.findById(req.params.id);
  cycle.isEnabled = !cycle.isEnabled;
  await cycle.save();
  req.flash('success', `Cycle ${cycle.label} is now ${cycle.isEnabled ? 'enabled' : 'disabled'}`);
  res.redirect(`/${req.organization.orgName}/admin/cycles`);
});

// POST: Seed 4 quarters and 1 year for a new year
router.post('/seed', isSuperAdmin, async (req, res) => {
  const { year } = req.body;

  if (!year || isNaN(year)) {
    req.flash('error', 'Invalid year');
    return res.redirect(`/${req.organization.orgName}/admin/cycles`);
  }

  try {
    const organization = await Organization.findById(req.organization._id);
    if (!organization) {
      req.flash('error', 'Organization not found.');
      return res.redirect(`/${req.organization.orgName}/admin/cycles`);
    }

    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

    for (let q of quarters) {
      const label = `${q}-${year}`;
      const exists = await OKRCycle.findOne({
        label,
        organization: req.organization._id
      });

      if (!exists) {
        const { startDate, endDate } = generateCycleDates(label, 'quarter', organization.financialYearStartMonth);

        const newQuarterCycle = new OKRCycle({
          label,
          type: 'quarter',
          startDate,
          endDate,
          isEnabled: false,
          organization: req.organization._id
        });

        await newQuarterCycle.save();
      }
    }

    // Year-level cycle
    const yearLabel = `${year}`;
    const yearExists = await OKRCycle.findOne({
      label: yearLabel,
      type: 'year',
      organization: req.organization._id
    });

    if (!yearExists) {
      const { startDate, endDate } = generateCycleDates(yearLabel, 'year', organization.financialYearStartMonth);

      const newYearCycle = new OKRCycle({
        label: yearLabel,
        type: 'year',
        startDate,
        endDate,
        isEnabled: false,
        organization: req.organization._id
      });

      await newYearCycle.save();
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
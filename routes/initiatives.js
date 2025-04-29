const express = require('express');
const router = express.Router({ mergeParams: true });
const Initiative = require('../models/Initiative');
const ActionItem = require('../models/ActionItem');
const KeyResult = require('../models/KeyResult');
const { isLoggedIn } = require('../middleware/auth');

// Get all Initaitives
router.get('/', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const keyResults = await KeyResult.find({ organization: req.organization._id });

  const initiatives = await Initiative.find({ organization: req.user.organization })
    .populate('keyResultId')
    .sort({ createdAt: -1 });

  res.render('initiatives/index', { 
    orgName, 
    initiatives,
    keyResults,
  });
});

// Show form to create new initiative
router.get('/new', isLoggedIn, async (req, res) => {
  const { orgName } = req.params;
  const keyResults = await KeyResult.find({ organization: req.user.organization });
  const preselectedKeyResultId = req.query.keyResultId || '';

  res.render('initiatives/new', { 
    orgName, 
    keyResults,
    preselectedKeyResultId
  });
});

// Create initiative
router.post('/', isLoggedIn, async (req, res) => {
  const { title, description, expectedOutcome } = req.body;
  const keyResultId = (req.body.keyResultId) ? req.body.keyResultId : null;
  const initiative = new Initiative({
    title,
    description,
    expectedOutcome,
    keyResultId,
    organization: req.user.organization,
    createdBy: req.user._id
  });

  await initiative.save();
  req.flash('success', 'Initiative created');
  res.redirect(`/${req.organization.orgName}/initiatives/${initiative._id}`);
});

// Show initiative with linked action items
router.get('/:id', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;
  const initiative = await Initiative.findById(id).populate('keyResultId');
  const actionItems = await ActionItem.find({ initiativeId: id });

  res.render('initiatives/show', { orgName, initiative, actionItems });
});

// Edit form
router.get('/:id/edit', isLoggedIn, async (req, res) => {
  const { orgName, id } = req.params;
  const initiative = await Initiative.findById(id);
  res.render('initiatives/edit', { orgName, initiative });
});

// Update initiative
router.put('/:id', isLoggedIn, async (req, res) => {
  const { id, orgName } = req.params;
  const { title, description, expectedOutcome, outcomeAchieved, status } = req.body;

  const initiative = await Initiative.findByIdAndUpdate(id, {
    title,
    description,
    expectedOutcome,
    outcomeAchieved,
    status,
    updatedAt: new Date()
  });

  req.flash('success', 'Initiative updated');
  res.redirect(`/${orgName}/initiatives/${id}`);
});

module.exports = router;

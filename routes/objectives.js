const express = require('express');
const router = express.Router({ mergeParams: true });
const Objective = require('../models/Objective');
const { isSuperAdminOrFunctionEditor, isSuperAdmin } = require('../middleware/checkRoles');
const { OpenAI } = require('openai');
const Team = require('../models/Team');
const { isLoggedIn } = require('../middleware/auth');
const KeyResult = require('../models/KeyResult');
const calculateObjectiveProgress = require('../utils/calculateObjectiveProgress');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ AI VALIDATION
router.post('/validate-ai', isSuperAdminOrFunctionEditor, async (req, res) => {
  const { title, description, cycle, teamName } = req.body;

  const prompt = `
You are an OKR assistant. A user is about to create this Objective:

Title: ${title}
Description: ${description}
Cycle: ${cycle}
Team: ${teamName}

Evaluate this Objective:
1. Is it outcome-driven?
2. Is it specific and actionable?
3. Is it aligned with the team’s focus?
4. How can it be improved?
Respond in JSON format with verdict and suggestions.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });

    res.json({ feedback: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI validation failed', details: err.message });
  }
});

//Get objectives and show this
router.get('/', isLoggedIn, async (req, res) => {
  try {
    const filter = { organization: req.organization._id };
    if (req.query.cycle) filter.cycle = req.query.cycle;

    const objectives = await Objective.find(filter).populate('teamId createdBy');

    res.render('objectives/index', {
      title: 'Objectives',
      orgName: req.organization.orgName,
      user: req.user,
      objectives,
      cycle: req.query.cycle || ''
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load objectives.');
    res.redirect(`/${req.organization.orgName}/dashboard`);
  }
});

// ✅ CREATE OBJECTIVE
router.post('/', isLoggedIn, async (req, res) => {
  const { title, description, cycle, teamId, parentObjective } = req.body;

  try {
    const objective = new Objective({
      title,
      description,
      cycle,
      teamId,
      organization: req.organization._id,
      createdBy: req.user._id,
      parentObjective: parentObjective || null
    });

    await objective.save();
    req.flash('success', 'Objective created successfully');
    res.redirect(`/${req.organization.orgName}/objectives`);

  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create objective');
    res.redirect(`/${req.organization.orgName}/objectives/new`);
  }
});

//Create a new objective
router.get('/new', isLoggedIn, async (req, res) => {
  try {
    const teams = await Team.find({ organization: req.organization._id });
    const objectives = await Objective.find({ organization: req.organization._id });

    res.render('objectives/new', {
      orgName: req.organization.orgName,
      user: req.user,
      teams,
      parentObjectives: objectives
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load form');
    res.redirect(`/${req.organization.orgName}/objectives`);
  }
});
  
// ✅ GET ALL OBJECTIVES FOR ORG/TEAM
router.get('/', async (req, res) => {
  try {
    const objectives = await Objective.find({
      organization: req.organization._id
    }).populate('teamId createdBy', 'name email');
    res.json(objectives);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch objectives' });
  }
});

// ✅ GET ONE OBJECTIVE
router.get('/:objectiveId', async (req, res) => {
  try {
    const obj = await Objective.findOne({
      _id: req.params.objectiveId,
      organization: req.organization._id
    }).populate('teamId createdBy', 'name email');

    if (!obj) return res.status(404).json({ error: 'Objective not found' });
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get objective' });
  }
});

// ✅ UPDATE OBJECTIVE
router.put('/:objectiveId', isSuperAdminOrFunctionEditor, async (req, res) => {
    try {
      const updated = await Objective.findOneAndUpdate(
        {
          _id: req.params.objectiveId,
          organization: req.organization._id
        },
        req.body,
        { new: true }
      );
  
      if (!updated) return res.status(404).json({ error: 'Objective not found' });
      res.json({ message: 'Objective updated', objective: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update objective' });
    }
});

// EDIT OBJECTIVES
router.get('/:id/edit', isLoggedIn, async (req, res) => {
  try {
    const objective = await Objective.findOne({
      _id: req.params.id,
      organization: req.organization._id
    });

    const teams = await Team.find({ organization: req.organization._id });
    const parentObjectives = await Objective.find({
      organization: req.organization._id,
      _id: { $ne: req.params.id } // exclude itself
    });

    if (!objective) {
      req.flash('error', 'Objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    res.render('objectives/edit', {
      orgName: req.organization.orgName,
      user: req.user,
      objective,
      teams,
      parentObjectives
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load edit form');
    res.redirect(`/${req.organization.orgName}/objectives`);
  }
});

//UPDATE OBJECTIVES
router.post('/:id', isLoggedIn, async (req, res) => {
  try {
    const { title, description, cycle, teamId, parentObjective } = req.body;

    await Objective.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      {
        title,
        description,
        cycle,
        teamId,
        parentObjective: parentObjective || null
      }
    );

    req.flash('success', 'Objective updated successfully');
    res.redirect(`/${req.organization.orgName}/objectives`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update objective');
    res.redirect(`/${req.organization.orgName}/objectives`);
  }
});

// ✅ FETCH CHILD OBJECTIVES
router.get('/parent/:parentId', async (req, res) => {
    const parentId = req.params.parentId;
    const children = await Objective.find({
      parentObjective: parentId,
      organization: req.organization._id
    });
    res.json(children);
  });
  
// ✅ DELETE (SOFT) OBJECTIVE
router.delete('/:objectiveId', isSuperAdmin, async (req, res) => {
  try {
    const obj = await Objective.findOneAndUpdate(
      {
        _id: req.params.objectiveId,
        organization: req.organization._id
      },
      { status: 'off track', summaryUpdate: 'Objective deactivated' },
      { new: true }
    );
    if (!obj) return res.status(404).json({ error: 'Objective not found' });
    res.json({ message: 'Objective deactivated', objective: obj });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete objective' });
  }
});

//DELETE OBJECTIVES
router.post('/:id/delete', isLoggedIn, async (req, res) => {
  try {
    await Objective.deleteOne({ _id: req.params.id, organization: req.organization._id });
    req.flash('success', 'Objective deleted successfully');
    res.redirect(`/${req.organization.orgName}/objectives`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to delete objective');
    res.redirect(`/${req.organization.orgName}/objectives`);
  }
});

// Utility to calculate progress
function calculateProgress(kr, latestUpdateValue) {
  if (kr.metricType === 'boolean') {
    return latestUpdateValue ? 100 : 0;
  }

  if (kr.metricType === 'milestone') {
    const total = kr.milestones.reduce((sum, m) => sum + m.weight, 0);
    const completed = kr.milestones.filter(m => m.completed).reduce((sum, m) => sum + m.weight, 0);
    return total ? Math.round((completed / total) * 100) : 0;
  }

  // For percent or number
  const start = Number(kr.startValue);
  const target = Number(kr.targetValue);
  const current = Number(latestUpdateValue ?? kr.startValue); // Use startValue if latest is undefined

  if (isNaN(start) || isNaN(target) || isNaN(current)) return 0;

  const isIncrease = kr.direction === 'increase' || (kr.direction === 'auto' && target > start);
  const numerator = isIncrease ? (current - start) : (start - current);
  const denominator = Math.abs(target - start);

  const progress = denominator ? (numerator / denominator) * 100 : 0;
  const safeProgress = Math.round(progress);

  return isNaN(safeProgress) ? 0 : Math.max(0, Math.min(safeProgress, 100));
}

// 🚀 Show all KRs under an objective
router.get('/:objectiveId/keyresults', isLoggedIn, async (req, res) => {
  const objective = await Objective.findOne({
    _id: req.params.objectiveId,
    organization: req.organization._id
  });

  const keyResults = await KeyResult.find({
    objectiveId: objective._id,
    deactivated: false
  });

  res.render('keyresults/index', {
    orgName: req.organization.orgName,
    user: req.user,
    objective,
    keyResults
  });
});

// ➕ Show new KR form
router.get('/:objectiveId/keyresults/new', isLoggedIn, async (req, res) => {
  const objective = await Objective.findOne({
    _id: req.params.objectiveId,
    organization: req.organization._id
  });

  if (!objective) {
    req.flash('error', 'Objective not found');
    return res.redirect(`/${req.organization.orgName}/objectives`);
  }

  res.render('keyresults/new', {
    orgName: req.organization.orgName,
    user: req.user,
    objective
  });
});

// ✅ Create KR
router.post('/:objectiveId/keyresults', isSuperAdminOrFunctionEditor, async (req, res) => {
  try {
    const kr = new KeyResult({
      ...req.body,
      organization: req.organization._id,
      objectiveId: req.params.objectiveId,
      createdBy: req.user._id
    });

    kr.progressValue = calculateProgress(kr);
    await kr.save();

    await calculateObjectiveProgress(req.params.objectiveId);

    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create Key Result');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  }
});

// 🧠 AI Validate
router.post('/:objectiveId/keyresults/validate-ai', isSuperAdminOrFunctionEditor, async (req, res) => {
  const { title, metricType, startValue, targetValue, objectiveTitle } = req.body;

  const prompt = `
You are an OKR assistant. A user is defining a Key Result for this Objective:
Objective: "${objectiveTitle}"

Key Result: "${title}"
Metric Type: ${metricType}
Start Value: ${startValue}
Target Value: ${targetValue}

Evaluate this Key Result and respond in JSON:
{
  "verdict": "...",
  "issues": ["...", "..."],
  "suggestedRewrite": "..."
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });

    const aiFeedback = JSON.parse(response.choices[0].message.content);
    res.json({ feedback: aiFeedback });
  } catch (err) {
    res.status(500).json({ error: 'AI validation failed', details: err.message });
  }
});

// ✏️ Edit KR form
router.get('/:objectiveId/keyresults/new', isLoggedIn, async (req, res) => {
  const objective = await Objective.findOne({
    _id: req.params.objectiveId,
    organization: req.organization._id
  });

  if (!objective) {
    req.flash('error', 'Objective not found');
    return res.redirect(`/${req.organization.orgName}/objectives`);
  }

  res.render('keyresults/new', {
    orgName: req.organization.orgName,
    user: req.user,
    objective,
    kr: null // ✅ Pass kr as null to avoid reference error
  });
});


// 🔁 Update KR
router.post('/:objectiveId/keyresults/:krId', isSuperAdminOrFunctionEditor, async (req, res) => {
  try {
    const kr = await KeyResult.findOneAndUpdate(
      {
        _id: req.params.krId,
        organization: req.organization._id
      },
      req.body,
      { new: true }
    );

    kr.progressValue = calculateProgress(kr);
    await kr.save();

    await calculateObjectiveProgress(req.params.objectiveId);

    req.flash('success', 'Key Result updated');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  } catch (err) {
    req.flash('error', 'Failed to update Key Result');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  }
});

// ⬆️ Update Progress (inline)
router.post('/:objectiveId/keyresults/:krId/update', isLoggedIn, async (req, res) => {
  const { updateValue, updateText } = req.body;

  try {
    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      organization: req.organization._id
    });

    if (!kr) return res.status(404).json({ error: 'Key Result not found' });

    kr.updates.push({
      updateValue,
      updateText,
      updatedBy: req.user._id
    });

    kr.progressValue = calculateProgress(kr, Number(updateValue));
    kr.updatedAt = new Date();
    await kr.save();

    await calculateObjectiveProgress(kr.objectiveId);

    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// ❌ Delete (soft)
router.post('/:objectiveId/keyresults/:krId/delete', isSuperAdmin, async (req, res) => {
  try {
    const kr = await KeyResult.findOneAndUpdate(
      {
        _id: req.params.krId,
        organization: req.organization._id
      },
      { deactivated: true },
      { new: true }
    );

    if (!kr) return res.status(404).json({ error: 'Key Result not found' });

    req.flash('success', 'Key Result deactivated');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete Key Result' });
  }
});


module.exports = router;

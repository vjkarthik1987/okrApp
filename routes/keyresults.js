const express = require('express');
const router = express.Router({ mergeParams: true });
const KeyResult = require('../models/KeyResult');
const Objective = require('../models/Objective');
const { OpenAI } = require('openai');
const { isSuperAdminOrFunctionEditor, isSuperAdmin } = require('../middleware/checkRoles');
const calculateObjectiveProgress = require('../utils/calculateObjectiveProgress');
const { isLoggedIn } = require('../middleware/auth');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function calculateProgress(kr, latestUpdateValue) {
  if (kr.metricType === 'boolean') {
    return latestUpdateValue ? 100 : 0;
  }

  if (kr.metricType === 'milestone') {
    const total = kr.milestones.reduce((sum, m) => sum + m.weight, 0);
    const completed = kr.milestones
      .filter(m => m.completed)
      .reduce((sum, m) => sum + m.weight, 0);
    return total ? Math.round((completed / total) * 100) : 0;
  }

  const start = Number(kr.startValue);
  const target = Number(kr.targetValue);
  const current = Number(latestUpdateValue);

  const isIncrease = kr.direction === 'increase' || (kr.direction === 'auto' && target > start);
  const numerator = isIncrease ? (current - start) : (start - current);
  const denominator = Math.abs(target - start);

  const progress = denominator ? (numerator / denominator) * 100 : 0;
  return Math.max(0, Math.min(Math.round(progress), 100));
}

// --------------------
// AI VALIDATION
// --------------------
router.post('/validate-ai', isSuperAdminOrFunctionEditor, async (req, res) => {
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

    const aiFeedback = JSON.parse(response.choices[0].message.content); // ✅ parse string
    res.json({ feedback: aiFeedback })
  } catch (err) {
    res.status(500).json({ error: 'AI validation failed', details: err.message });
  }
});
// --------------------
// SHOW KRs under an objective
router.get('/:id/keyresults', isLoggedIn, async (req, res) => {
  const objective = await Objective.findOne({
    _id: req.params.id,
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

// --------------------
// CREATE KEY RESULT
// --------------------
router.post('/:id/keyresults', isSuperAdminOrFunctionEditor, async (req, res) => {
  try {
    const kr = new KeyResult({
      ...req.body,
      organization: req.organization._id,
      objectiveId: req.params.id,  // ✅ inject it here from URL
      createdBy: req.user._id
    });

    if (['milestone', 'percent', 'number', 'boolean'].includes(kr.metricType)) {
      kr.progressValue = calculateProgress(kr);
      await kr.save();
    }

    await kr.save();

    res.redirect(`/${req.organization.orgName}/keyresults/${req.params.id}/keyresults`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create Key Result');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.id}/keyresults`);
  }
});

// --------------------
// GET KRs BY OBJECTIVE
// --------------------
router.get('/objective/:objectiveId', async (req, res) => {
  try {
    const krs = await KeyResult.find({
      objectiveId: req.params.objectiveId,
      organization: req.organization._id
    }).populate('owner', 'name email');
    res.json(krs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Key Results' });
  }
});

// --------------------
// GET SINGLE KR
// --------------------
router.get('/:krId', async (req, res) => {
  try {
    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      organization: req.organization._id
    }).populate('owner', 'name email');

    if (!kr) return res.status(404).json({ error: 'Key Result not found' });
    res.json(kr);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Key Result' });
  }
});

// --------------------
// UPDATE A KR
// --------------------
router.put('/:krId', isSuperAdminOrFunctionEditor, async (req, res) => {
  try {
    const kr = await KeyResult.findOneAndUpdate(
      { _id: req.params.krId, organization: req.organization._id },
      req.body,
      { new: true }
    );

    if (!kr) return res.status(404).json({ error: 'Key Result not found' });

    if (kr.metricType === 'milestone') {
      kr.progressValue = calculateProgress(kr);
      await kr.save();
    }

    await calculateObjectiveProgress(kr.objectiveId);

    res.json({ message: 'Key Result updated', keyResult: kr });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update Key Result' });
  }
});

// --------------------
// ADD PROGRESS UPDATE
// --------------------
router.post('/:krId/update', async (req, res) => {
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

    kr.progressValue = calculateProgress(kr, updateValue);
    kr.updatedAt = new Date();
    await kr.save();

    await calculateObjectiveProgress(kr.objectiveId);

    res.json({ message: 'Progress updated', keyResult: kr });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// --------------------
// SHOW CREATE NEW KR
// --------------------

router.get('/:id/keyresults/new', isLoggedIn, async (req, res) => {
  const objective = await Objective.findOne({
    _id: req.params.id,
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


// --------------------
// DELETE / DEACTIVATE
// --------------------
router.delete('/:krId', isSuperAdmin, async (req, res) => {
  try {
    const kr = await KeyResult.findOneAndUpdate(
      { _id: req.params.krId, organization: req.organization._id },
      { deactivated: true },
      { new: true }
    );

    if (!kr) return res.status(404).json({ error: 'Key Result not found' });
    res.json({ message: 'Key Result deactivated', keyResult: kr });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete Key Result' });
  }
});

module.exports = router;
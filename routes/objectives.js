const express = require('express');
const router = express.Router({ mergeParams: true });
const Objective = require('../models/Objective');
const { isSuperAdminOrFunctionEditor, isSuperAdmin } = require('../middleware/checkRoles');
const { OpenAI } = require('openai');
const Team = require('../models/Team');
const { isLoggedIn } = require('../middleware/auth');
const KeyResult = require('../models/KeyResult');
const calculateObjectiveProgress = require('../utils/calculateObjectiveProgress');
const OKRCycle = require('../models/OKRCycle');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ AI VALIDATION
router.post('/validate-ai', isSuperAdminOrFunctionEditor, async (req, res) => {
  const { title, description, cycle, teamName } = req.body;

  const prompt = `
You are an OKR assistant. A user is about to create this Objective:

Title: ${title}
Description: ${description}
OKRCycle: ${cycle}
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

// ✅ GET ALL OBJECTIVES
router.get('/', isLoggedIn, async (req, res) => {
  try {
    const filter = { organization: req.organization._id };
    if (req.query.cycle) {
      filter.cycle = { $in: [req.query.cycle] }; // 🔥 Multi-cycle filter
    }

    const objectives = await Objective.find(filter).populate('teamId createdBy');

    const enabledCycles = await OKRCycle.find({
      organization: req.organization._id,
      isEnabled: true
    }).sort({ label: 1 });

    res.render('objectives/index', {
      title: 'Objectives',
      orgName: req.organization.orgName,
      user: req.user,
      objectives,
      cycle: req.query.cycle || '',
      enabledCycles
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load objectives.');
    res.redirect(`/${req.organization.orgName}/dashboard`);
  }
});

// ✅ CREATE OBJECTIVE
router.post('/',
  isLoggedIn,
  (req, res, next) => {
    req.body.teamId = req.body.teamId;
    next();
  },
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    const { title, description, cycle, teamId, parentObjective } = req.body;

    if (!cycle || (Array.isArray(cycle) && cycle.length === 0)) {
      req.flash('error', 'At least one OKR Cycle must be selected');
      return res.redirect(`/${req.organization.orgName}/objectives/new`);
    }

    const cyclesArray = Array.isArray(cycle) ? cycle : [cycle];
    const year = cyclesArray[0].includes('-') ? cyclesArray[0].split('-')[1] : cyclesArray[0];

    try {
      const objective = new Objective({
        title,
        description,
        cycle: cyclesArray,
        year,
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
  }
);

// ✅ NEW OBJECTIVE FORM
router.get('/new', isLoggedIn, async (req, res) => {
  try {
    const teams = await Team.find({ organization: req.organization._id });
    const objectives = await Objective.find({ organization: req.organization._id });
    const enabledCycles = await OKRCycle.find({
      organization: req.organization._id,
      isEnabled: true,
      type: 'quarter'
    }).sort({ label: 1 });

    res.render('objectives/new', {
      orgName: req.organization.orgName,
      user: req.user,
      teams,
      parentObjectives: objectives,
      enabledCycles
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load form');
    res.redirect(`/${req.organization.orgName}/objectives`);
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

// ✅ UPDATE OBJECTIVE (API)
router.put('/:objectiveId',
  isLoggedIn,
  async (req, res, next) => {
    const existing = await Objective.findOne({
      _id: req.params.objectiveId,
      organization: req.organization._id
    });
    if (!existing) return res.status(404).json({ error: 'Objective not found' });

    req.body.teamId = existing.teamId;
    next();
  },
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    try {
      const updated = await Objective.findByIdAndUpdate(
        req.params.objectiveId,
        req.body,
        { new: true }
      );
      res.json({ message: 'Objective updated', objective: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update objective' });
    }
  }
);

// ✅ EDIT OBJECTIVE FORM
router.get('/:id/edit', isLoggedIn, async (req, res) => {
  try {
    const objective = await Objective.findOne({
      _id: req.params.id,
      organization: req.organization._id
    });

    if (!objective) {
      req.flash('error', 'Objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    const teams = await Team.find({ organization: req.organization._id });
    const parentObjectives = await Objective.find({
      organization: req.organization._id,
      _id: { $ne: req.params.id }
    });
    const enabledCycles = await OKRCycle.find({
      organization: req.organization._id,
      isEnabled: true
    }).sort({ label: 1 });

    res.render('objectives/edit', {
      orgName: req.organization.orgName,
      user: req.user,
      objective,
      teams,
      parentObjectives,
      enabledCycles
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load edit form');
    res.redirect(`/${req.organization.orgName}/objectives`);
  }
});

// ✅ UPDATE OBJECTIVE (FORM POST)
router.post('/:id', isLoggedIn, async (req, res) => {
  try {
    const { title, description, cycle, teamId, parentObjective } = req.body;

    const cyclesArray = Array.isArray(cycle) ? cycle : [cycle];

    await Objective.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      {
        title,
        description,
        cycle: cyclesArray,
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

// ✅ Child objectives fetch
router.get('/parent/:parentId', async (req, res) => {
  const parentId = req.params.parentId;
  const children = await Objective.find({
    parentObjective: parentId,
    organization: req.organization._id
  });
  res.json(children);
});
  
// ✅ Soft Delete Objective
router.delete('/:objectiveId',
  isLoggedIn,
  async (req, res, next) => {
    const obj = await Objective.findOne({
      _id: req.params.objectiveId,
      organization: req.organization._id
    });
    if (!obj) return res.status(404).json({ error: 'Objective not found' });

    req.body.teamId = obj.teamId;
    req.objective = obj;
    next();
  },
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    try {
      const updated = await Objective.findByIdAndUpdate(
        req.objective._id,
        { status: 'off track', summaryUpdate: 'Objective deactivated' },
        { new: true }
      );
      res.json({ message: 'Objective deactivated', objective: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to deactivate objective' });
    }
  }
);

// ✅ Hard Delete (UI Button POST)
router.post('/:id/delete',
  isLoggedIn,
  async (req, res, next) => {
    const objective = await Objective.findById(req.params.id);
    if (!objective) {
      req.flash('error', 'Objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    req.body.teamId = objective.teamId;
    req.objective = objective;
    next();
  },
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    try {
      await Objective.deleteOne({ _id: req.objective._id });
      req.flash('success', 'Objective deleted successfully');
      res.redirect(`/${req.organization.orgName}/objectives`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to delete objective');
      res.redirect(`/${req.organization.orgName}/objectives`);
    }
  }
);

// Utility to calculate progress
function calculateProgress(kr, latestUpdateValue) {
  const start = Number(kr.startValue);
  const target = Number(kr.targetValue);
  const current = Number(latestUpdateValue ?? kr.startValue);

  console.log('📊 Start:', kr.startValue, 'Parsed:', start);
  console.log('🎯 Target:', kr.targetValue, 'Parsed:', target);
  console.log('📍 Current:', latestUpdateValue, 'Parsed:', current);

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
router.post('/:objectiveId/keyresults',
  isLoggedIn,
  async (req, res, next) => {
    const objective = await Objective.findOne({
      _id: req.params.objectiveId,
      organization: req.organization._id
    });
    if (!objective) {
      req.flash('error', 'Objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    req.body.teamId = objective.teamId;
    req.objective = objective;
    next();
  },
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    try {
      const kr = new KeyResult({
        ...req.body,
        organization: req.organization._id,
        objectiveId: req.params.objectiveId,
        createdBy: req.user._id
      });

      if (kr.metricType === 'percent' || kr.metricType === 'number') {
        kr.startValue = Number(req.body.startValue);
        kr.targetValue = Number(req.body.targetValue);
      }

      kr.progressValue = calculateProgress(kr);
      await kr.save();
      await calculateObjectiveProgress(req.params.objectiveId);

      res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to create Key Result');
      res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }
  }
);

// 🧠 AI Validate
router.post('/:objectiveId/keyresults/validate-ai', isSuperAdminOrFunctionEditor, async (req, res) => {
  console.log('Hitting Validate AI route')
  const { title, metricType, startValue, targetValue, objectiveTitle } = req.body;

  const prompt = `
You are an OKR assistant. A user is defining a Key Result for this Objective:
Objective: "${objectiveTitle}"
This is for SunTec, a mid-sized (500 to 700 employees) enterprise product organization.

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

//AI Milestone Generation 
router.post('/:objectiveId/keyresults/generate-milestones', async (req, res) => {
  const { krTitle } = req.body;

  const prompt = `
You are an AI assistant helping define OKRs at SunTec, a midsized enterprise product-based organization.
Given the following Key Result: "${krTitle}", suggest 5 clear milestone steps that break down the work toward achieving this result.
Each step should be simple, outcome-oriented, and progress-specific.
Return only the milestone steps as a numbered list.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });

    const text = completion.choices[0].message.content;
    const milestones = text.split('\n').filter(line => line.trim()).map(line => line.replace(/^\d+\.\s*/, ''));
    res.json({ milestones });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate milestones' });
  }
});


// ✏️ GET: Edit a Key Result
router.get('/:objectiveId/keyresults/:krId/edit', isLoggedIn, async (req, res) => {
  try {
    const objective = await Objective.findOne({
      _id: req.params.objectiveId,
      organization: req.organization._id
    });

    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      objectiveId: req.params.objectiveId,
      organization: req.organization._id
    });

    if (!kr || !objective) {
      req.flash('error', 'Key Result or Objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }

    res.render('keyresults/edit', {
      orgName: req.organization.orgName,
      user: req.user,
      objective,
      kr
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load edit form');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  }
});


// ⬆️ Update Progress (inline)
router.post('/:objectiveId/keyresults/:krId',
  isLoggedIn,
  async (req, res, next) => {
    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      organization: req.organization._id
    });

    if (!kr) {
      req.flash('error', 'Key Result not found');
      return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }

    const objective = await Objective.findOne({
      _id: kr.objectiveId,
      organization: req.organization._id
    });

    if (!objective) {
      req.flash('error', 'Associated objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    req.body.teamId = objective.teamId;
    req.keyResult = kr;
    next();
  },
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    try {
      const kr = req.keyResult;

      kr.title = req.body.title;
      kr.metricType = req.body.metricType;
      kr.startValue = Number(req.body.startValue);
      kr.targetValue = Number(req.body.targetValue);
      kr.direction = req.body.direction || 'auto';
      kr.updatedAt = new Date();

      if (Array.isArray(req.body.milestones)) {
        kr.milestones = req.body.milestones.map(m => ({
          label: m.label,
          weight: Number(m.weight),
          dueDate: m.dueDate ? new Date(m.dueDate) : undefined
        }));
      }

      kr.progressValue = calculateProgress(kr);
      await kr.save();
      await calculateObjectiveProgress(req.params.objectiveId);

      req.flash('success', 'Key Result updated successfully');
      res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to update Key Result');
      res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }
  }
);

// ⬆️ Inline Progress Update
router.post('/:objectiveId/keyresults/:krId/update',
  isLoggedIn,
  async (req, res, next) => {
    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      organization: req.organization._id
    });

    if (!kr) {
      req.flash('error', 'Key Result not found');
      return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }

    const objective = await Objective.findById(kr.objectiveId);
    if (!objective) {
      req.flash('error', 'Associated objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    req.body.teamId = objective.teamId;
    req.keyResult = kr;
    next();
  },
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    try {
      const kr = req.keyResult;
      const parsedValue = parseFloat(req.body.updateValue);

      if (isNaN(parsedValue)) {
        req.flash('error', 'Progress must be a valid number');
        return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
      }

      kr.updates.push({
        updateValue: parsedValue,
        updateText: req.body.updateText,
        updatedBy: req.user._id
      });

      kr.progressValue = calculateProgress(kr, parsedValue);
      kr.updatedAt = new Date();

      await kr.save();
      await calculateObjectiveProgress(kr.objectiveId);

      req.flash('success', 'Progress updated');
      res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to update progress');
      res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }
  }
);

// ❌ Delete (soft)
router.post('/:objectiveId/keyresults/:krId/delete',
  isLoggedIn,
  async (req, res, next) => {
    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      organization: req.organization._id
    });

    if (!kr) {
      req.flash('error', 'Key Result not found');
      return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }

    const objective = await Objective.findById(kr.objectiveId);
    if (!objective) {
      req.flash('error', 'Associated objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    req.body.teamId = objective.teamId;
    req.krToDelete = kr;
    next();
  },
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    try {
      req.krToDelete.deactivated = true;
      await req.krToDelete.save();

      req.flash('success', 'Key Result deactivated');
      res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete Key Result' });
    }
  }
);

module.exports = router;

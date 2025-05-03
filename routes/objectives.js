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
const Initiative = require('../models/Initiative');
const { checkKREditPermission } = require('../middleware/krPermissions');
const getAllSubTeams = require('../utils/getAllSubTeams');
const getFunctionHeadAccessTeamIds = require('../utils/getFunctionHeadAccessTeamIds');
const mongoose = require('mongoose');
const checkKREditAccess = require('../middleware/checkKREditAccess');
const User = require('../models/User');

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
    const selectedCycle = req.query.cycle || '';
    const selectedTeamId = req.query.teamId || '';

    if (selectedCycle) {
      filter.cycle = { $in: [selectedCycle] };
    }

    let accessibleTeamIds = [];

    if (req.user.isSuperAdmin) {
      // Super Admin can filter by team or see all
      if (selectedTeamId) {
        const teamObjectId = new mongoose.Types.ObjectId(selectedTeamId);
        filter.$or = [
          { teamId: teamObjectId },
          { assignedTeams: teamObjectId }
        ];
      }
      // Load all teams for dropdown
      accessibleTeamIds = await Team.find({ organization: req.organization._id }, '_id').then(t => t.map(ti => ti._id));
    } else {
      accessibleTeamIds = await getFunctionHeadAccessTeamIds(req.user._id);

      if (
        selectedTeamId &&
        accessibleTeamIds.map(id => id.toString()).includes(selectedTeamId)
      ) {
        const teamObjectId = new mongoose.Types.ObjectId(selectedTeamId);
        filter.$or = [
          { teamId: teamObjectId },
          { assignedTeams: teamObjectId }
        ];
      } else {
        // Default to all accessible teams
        filter.$or = [
          { teamId: { $in: accessibleTeamIds } },
          { assignedTeams: { $in: accessibleTeamIds } }
        ];
      }
    }

    const objectives = await Objective.find(filter)
      .populate('teamId createdBy assignedTeams');

    const enabledCycles = await OKRCycle.find({
      organization: req.organization._id,
      isEnabled: true
    }).sort({ label: 1 });

    const accessibleTeams = await Team.find({ _id: { $in: accessibleTeamIds } });

    res.render('objectives/index', {
      title: 'Objectives',
      orgName: req.organization.orgName,
      user: req.user,
      objectives,
      cycle: selectedCycle,
      selectedTeamId,
      enabledCycles,
      accessibleTeams
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
  isSuperAdminOrFunctionEditor,
  async (req, res) => {
    const { title, description, cycle, teamId, parentObjective, assignedTeams } = req.body;

    if (!cycle || (Array.isArray(cycle) && cycle.length === 0)) {
      req.flash('error', 'At least one OKR Cycle must be selected');
      return res.redirect(`/${req.organization.orgName}/objectives/new`);
    }

    const cyclesArray = Array.isArray(cycle) ? cycle : [cycle];
    const year = cyclesArray[0].includes('-') ? cyclesArray[0].split('-')[1] : cyclesArray[0];

    try {
      const finalAssignedTeams = assignedTeams && assignedTeams.length > 0 
        ? (Array.isArray(assignedTeams) ? assignedTeams : [assignedTeams])
        : [teamId];
      const objective = new Objective({
        title,
        description,
        cycle: cyclesArray,
        year,
        teamId,
        assignedTeams: finalAssignedTeams,
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
    let teams = [];

    if (req.user.isSuperAdmin) {
      teams = await Team.find({ organization: req.organization._id });
    } else {
      const userTeam = await Team.findById(req.user.team);
      if (!userTeam) throw new Error('User team not found');

      // ✅ Fetch user's team + all subteams recursively
      const subTeams = await getAllSubTeams(req.user.team);
      teams = [userTeam, ...subTeams];
    }

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
    const { title, description, cycle, teamId, parentObjective, assignedTeams } = req.body;

    const cyclesArray = Array.isArray(cycle) ? cycle : [cycle];

    await Objective.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      {
        title,
        description,
        cycle: cyclesArray,
        teamId,
        parentObjective: parentObjective || null,
        assignedTeams: Array.isArray(assignedTeams) ? assignedTeams : [assignedTeams]
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

  if (isNaN(start) || isNaN(target) || isNaN(current)) return 0;

  const isIncrease = kr.direction === 'increase' || (kr.direction === 'auto' && target > start);
  const numerator = isIncrease ? (current - start) : (start - current);
  const denominator = Math.abs(target - start);

  const progress = denominator ? (numerator / denominator) * 100 : 0;
  const safeProgress = Math.round(progress);

  return isNaN(safeProgress) ? 0 : Math.max(0, Math.min(safeProgress, 100));
}

//---------------------------
//Section for Key Results (KR)
//----------------------------

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

  const teams = await Team.find({ organization: req.organization._id });
  const users = await User.find({ organization: req.organization._id, isActive: true });
  if (!objective) {
    req.flash('error', 'Objective not found');
    return res.redirect(`/${req.organization.orgName}/objectives`);
  }

  res.render('keyresults/new', {
    orgName: req.organization.orgName,
    user: req.user,
    objective,
    teams, 
    users   
  });
});

// ✅ Create KR
router.post('/:objectiveId/keyresults', isLoggedIn, async (req, res) => {
  try {
    const { objectiveId } = req.params;
    const objective = await Objective.findOne({
      _id: objectiveId,
      organization: req.organization._id
    });

    if (!objective) {
      req.flash('error', 'Objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    const userId = req.user._id.toString();
    const isSuperAdmin = req.user.isSuperAdmin;

    // ✅ Use assignedTeams from the Objective itself (not req.body)
    const assignedTeamIds = (objective.assignedTeams || []).map(id => id.toString());

    const teams = await Team.find({ _id: { $in: assignedTeamIds } });

    const hasTeamPermission = teams.some(team =>
      team.functionHead?.toString() === userId ||
      (team.okrEditors || []).some(editorId => editorId.toString() === userId)
    );

    if (!isSuperAdmin && !hasTeamPermission) {
      req.flash('error', 'Access denied. You must be a Function Head or OKR Editor of a team or a Super Adminassigned to this Objective.');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    // ✅ Proceed to create KR
    const assignedTeams = Array.isArray(req.body.assignedTeams)
      ? req.body.assignedTeams
      : [req.body.assignedTeams].filter(Boolean);

    const assignedTo = Array.isArray(req.body.assignedTo)
      ? req.body.assignedTo
      : [req.body.assignedTo].filter(Boolean);

    const kr = new KeyResult({
      ...req.body,
      assignedTeams,
      assignedTo,
      organization: req.organization._id,
      objectiveId,
      createdBy: req.user._id
    });

    if (kr.metricType === 'milestone' && Array.isArray(req.body.milestones)) {
      kr.milestones = req.body.milestones
        .filter(m => m.label?.trim())
        .map(m => ({
          label: m.label.trim(),
          weight: Number(m.weight),
          dueDate: m.dueDate ? new Date(m.dueDate) : undefined
        }));
    }

    if (!kr.dueDate) {
      const cycle = await OKRCycle.findOne({
        label: { $in: objective.cycle },
        organization: req.organization._id
      });
      if (cycle) kr.dueDate = cycle.endDate;
    }

    kr.progressValue = calculateProgress(kr);

    await kr.save();
    await calculateObjectiveProgress(objectiveId);

    req.flash('success', 'Key Result created successfully');
    res.redirect(`/${req.organization.orgName}/objectives/${objectiveId}/keyresults`);

  } catch (err) {
    console.error('Error saving Key Result:', err.stack || err);
    req.flash('error', 'Failed to create Key Result. Please check the form values.');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  }
});

// ✅ SHOW Key Result
router.get('/:objectiveId/keyresults/:krId', isLoggedIn, async (req, res) => {
  try {
    const objective = await Objective.findOne({
      _id: req.params.objectiveId,
      organization: req.organization._id
    });

    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      objectiveId: objective._id,
      organization: req.organization._id
    });

    if (!kr || !objective) {
      req.flash('error', 'Key Result or Objective not found');
      return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }

    res.render('keyresults/show', {
      orgName: req.organization.orgName,
      user: req.user,
      objective,
      kr
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load Key Result');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  }
});


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
router.get('/:objectiveId/keyresults/:krId/edit',
  isLoggedIn,
  checkKREditAccess,
  async (req, res) => {
    const objective = await Objective.findOne({
      _id: req.params.objectiveId,
      organization: req.organization._id
    });

    const teams = await Team.find({ organization: req.organization._id });
    const users = await User.find({ organization: req.organization._id, isActive: true });

    res.render('keyresults/edit', {
      orgName: req.organization.orgName,
      user: req.user,
      objective,
      kr: req.keyResult,
      teams,
      users
    });
  }
);


// ⬆️ Update Progress completely
router.post('/:objectiveId/keyresults/:krId',
  isLoggedIn,
  async (req, res) => {
    try {
      const kr = await KeyResult.findOne({
        _id: req.params.krId,
        organization: req.organization._id
      }).populate('assignedTeams ownerTeam assignedTo');

      if (!kr) {
        req.flash('error', 'Key Result not found');
        return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
      }

      const userId = req.user._id.toString();
      const userTeamId = req.user.team?.toString();

      const isOwner = kr.owner?.toString() === userId;
      const isOwnerTeam = kr.ownerTeam?.toString() === userTeamId;
      const isAssignedTo = kr.assignedTo?.some(user => user._id.toString() === userId);

      const assignedTeamAccess = kr.assignedTeams?.some(team => {
        return (
          team.functionHead?.toString() === userId ||
          team.okrEditors?.some(editor => editor.toString() === userId)
        );
      });

      const isSuperAdmin = req.user.isSuperAdmin;

      if (!(isSuperAdmin || isOwner || isOwnerTeam || isAssignedTo || assignedTeamAccess)) {
        req.flash('error', 'Access denied. You are not authorized to edit this Key Result.');
        return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
      }

      kr.title = req.body.title;
      kr.metricType = req.body.metricType;
      kr.direction = req.body.direction || 'auto';
      kr.updatedAt = new Date();

      kr.assignedTeams = Array.isArray(req.body.assignedTeams)
        ? req.body.assignedTeams
        : [req.body.assignedTeams].filter(Boolean);

      kr.assignedTo = Array.isArray(req.body.assignedTo)
        ? req.body.assignedTo
        : [req.body.assignedTo].filter(Boolean);

      if (kr.metricType === 'milestone') {
        kr.startValue = null;
        kr.targetValue = null;
        kr.milestones = req.body.milestones.map(m => ({
          label: m.label,
          weight: Number(m.weight),
          dueDate: m.dueDate ? new Date(m.dueDate) : undefined
        }));
      } else {
        kr.startValue = Number(req.body.startValue);
        kr.targetValue = Number(req.body.targetValue);
      }

      kr.progressValue = calculateProgress(kr);

      if (kr.progressValue === 100 && !kr.actualCompletionDate) {
        kr.actualCompletionDate = new Date();
      } else if (kr.progressValue < 100) {
        kr.actualCompletionDate = null;
      }

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
  async (req, res) => {
    try {
      const kr = await KeyResult.findOne({
        _id: req.params.krId,
        organization: req.organization._id
      }).populate('assignedTeams ownerTeam assignedTo');

      if (!kr) {
        req.flash('error', 'Key Result not found');
        return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
      }

      const objective = await Objective.findById(kr.objectiveId);
      if (!objective) {
        req.flash('error', 'Associated objective not found');
        return res.redirect(`/${req.organization.orgName}/objectives`);
      }

      const userId = req.user._id.toString();
      const userTeamId = req.user.team?.toString();

      const isOwner = kr.owner?.toString() === userId;
      const isOwnerTeam = kr.ownerTeam?.toString() === userTeamId;
      const isAssignedTo = kr.assignedTo?.some(user => user._id.toString() === userId);

      const assignedTeamAccess = kr.assignedTeams?.some(team => {
        return (
          team.functionHead?.toString() === userId ||
          team.okrEditors?.some(editor => editor.toString() === userId)
        );
      });

      const isSuperAdmin = req.user.isSuperAdmin;

      if (!(isSuperAdmin || isOwner || isOwnerTeam || isAssignedTo || assignedTeamAccess)) {
        req.flash('error', 'Access denied. You are not authorized to update progress.');
        return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
      }

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

      if (kr.progressValue === 100 && !kr.actualCompletionDate) {
        kr.actualCompletionDate = new Date();
      } else if (kr.progressValue < 100 && kr.actualCompletionDate) {
        kr.actualCompletionDate = undefined;
      }

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
  checkKREditAccess,
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

// ✅ Toggle Milestone Completion
router.post('/:objectiveId/keyresults/:krId/milestone/:index/toggle', 
isLoggedIn, 
checkKREditAccess,
async (req, res) => {
  try {
    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      organization: req.organization._id
    });

    if (!kr || !kr.milestones[req.params.index]) {
      req.flash('error', 'Milestone not found');
      return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }

    kr.milestones[req.params.index].completed = !kr.milestones[req.params.index].completed;

    // Update progress based on milestone weights
    const totalWeight = kr.milestones.reduce((sum, m) => sum + (m.completed ? m.weight : 0), 0);
    kr.progressValue = Math.round(totalWeight);

    // Auto-set or unset actual completion date
    const allDone = kr.milestones.every(m => m.completed);
    kr.actualCompletionDate = allDone ? new Date() : null;

    await kr.save();
    await calculateObjectiveProgress(req.params.objectiveId);

    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update milestone');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  }
});

// ❌ Delete an update inside KeyResult
router.post('/:objectiveId/keyresults/:krId/updates/:updateIndex/delete', 
isLoggedIn, 
checkKREditAccess,
async (req, res, next) => {
  try {
    const kr = await KeyResult.findOne({
      _id: req.params.krId,
      organization: req.organization._id
    });

    if (!kr) {
      req.flash('error', 'Key Result not found');
      return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }

    const updateIndex = parseInt(req.params.updateIndex, 10);
    if (isNaN(updateIndex) || updateIndex < 0 || updateIndex >= kr.updates.length) {
      req.flash('error', 'Invalid update selected.');
      return res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
    }

    // ❌ Remove the update at that index
    kr.updates.splice(updateIndex, 1);

    // 🔄 Recalculate progress based on the latest update left
    const latestUpdate = kr.updates.length > 0 ? kr.updates[kr.updates.length - 1] : null;
    kr.progressValue = calculateProgress(kr, latestUpdate ? latestUpdate.updateValue : undefined);

    // 🔥 If KR is 100% earlier and now falls below 100%, reset actualCompletionDate
    if (kr.progressValue < 100 && kr.actualCompletionDate) {
      kr.actualCompletionDate = undefined;
    }

    await kr.save();
    await calculateObjectiveProgress(kr.objectiveId);

    req.flash('success', 'Update deleted successfully');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to delete update');
    res.redirect(`/${req.organization.orgName}/objectives/${req.params.objectiveId}/keyresults`);
  }
});

router.get('/:objectiveId/keyresults/:krId/initiatives', isLoggedIn, async (req, res) => {
  const { orgName, krId } = req.params;

  const keyResult = await KeyResult.findOne({
    _id: krId,
    organization: req.organization._id
  });

  if (!keyResult) {
    req.flash('error', 'Key Result not found');
    return res.redirect(`/${orgName}/objectives`);
  }

  const initiatives = await Initiative.find({
    keyResultId: krId,
    organization: req.organization._id
  }).sort({ createdAt: -1 });

  res.render('initiatives/byKR', {
    orgName,
    keyResult,
    initiatives
  });
});

module.exports = router;

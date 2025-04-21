const express = require('express');
const router = express.Router({ mergeParams: true });
const Team = require('../models/Team');
const { isSuperAdmin } = require('../middleware/checkRoles');
const User = require('../models/User');

//Teams index page
router.get('/', isSuperAdmin, async (req, res) => {
  try {
    const teams = await Team.find({
      organization: req.organization._id,
      activeTeam: true
    }).populate('functionHead okrEditors parentTeam', 'name email');

    res.render('teams/index', {
      orgName: req.organization.orgName,
      user: req.user,
      teams
    });
  } catch (err) {
    req.flash('error', 'Failed to load teams');
    res.redirect(`/${req.organization.orgName}/dashboard`);
  }
});


// GET form to create team
router.get('/new', isSuperAdmin, async (req, res) => {
  const users = await User.find({ organization: req.organization._id });
  const teams = await Team.find({ organization: req.organization._id });
  res.render('teams/new', { orgName: req.organization.orgName, users, teams });
});

// CREATE a team
router.post('/', isSuperAdmin, async (req, res) => {
  try {
    const { name, parentTeam, functionHead, okrEditors } = req.body;

    const team = new Team({
      name,
      parentTeam: parentTeam || null,
      functionHead,
      okrEditors,
      organization: req.organization._id,
    });

    await team.save();
    res.status(201).json({ message: 'Team created', team });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// READ all active teams in org
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find({
      organization: req.organization._id,
      activeTeam: true
    }).populate('functionHead okrEditors parentTeam', 'name email');
    
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// READ single team
router.get('/:teamId', async (req, res) => {
  try {
    const team = await Team.findOne({
      _id: req.params.teamId,
      organization: req.organization._id
    }).populate('functionHead okrEditors parentTeam', 'name email');

    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// GET form to edit team
router.get('/:teamId/edit', isSuperAdmin, async (req, res) => {
  const team = await Team.findOne({ _id: req.params.teamId, organization: req.organization._id });
  const users = await User.find({ organization: req.organization._id });
  const teams = await Team.find({ organization: req.organization._id, _id: { $ne: team._id } });
  res.render('teams/edit', { orgName: req.organization.orgName, team, users, teams });
});

// UPDATE team
router.put('/:teamId', isSuperAdmin, async (req, res) => {
  try {
    const updatedTeam = await Team.findOneAndUpdate(
      { _id: req.params.teamId, organization: req.organization._id },
      req.body,
      { new: true }
    ).populate('functionHead okrEditors parentTeam', 'name email');

    if (!updatedTeam) return res.status(404).json({ error: 'Team not found' });
    req.flash('success', 'Team updated successfully');
    res.redirect(`/${req.organization.orgName}/teams`);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// DELETE (deactivate) team
router.delete('/:teamId', isSuperAdmin, async (req, res) => {
  try {
    const teamId = req.params.teamId;

    // 1. Check for sub-teams
    const hasChildren = await Team.exists({
      parentTeam: teamId,
      organization: req.organization._id,
      activeTeam: true
    });

    if (hasChildren) {
      req.flash('error', 'This team has sub-teams. Reassign or remove them first.');
      return res.redirect(`/${req.organization.orgName}/teams`);
    }

    // 2. Check for active users in this team
    const hasUsers = await User.exists({
      team: teamId,
      organization: req.organization._id,
      isActive: true
    });

    if (hasUsers) {
      req.flash('error', 'This team has users assigned. Please reassign or deactivate them first.');
      return res.redirect(`/${req.organization.orgName}/teams`);
    }

    // 3. (Optional) Check if team is used in any active Objective
    const isTaggedInObjective = await Objective.exists({
      teamId: teamId,
      organization: req.organization._id
    });

    if (isTaggedInObjective) {
      req.flash('error', 'This team is tagged to an objective. Please update the objective before deletion.');
      return res.redirect(`/${req.organization.orgName}/teams`);
    }

    // ✅ Proceed with soft delete
    await Team.findOneAndUpdate(
      { _id: teamId, organization: req.organization._id },
      { activeTeam: false }
    );

    req.flash('success', 'Team deactivated successfully');
    res.redirect(`/${req.organization.orgName}/teams`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to deactivate team');
    res.redirect(`/${req.organization.orgName}/teams`);
  }
});

module.exports = router;

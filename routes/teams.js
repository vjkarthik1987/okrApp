const express = require('express');
const router = express.Router({ mergeParams: true });
const Team = require('../models/Team');
const { isSuperAdmin } = require('../middleware/checkRoles');
const User = require('../models/User');
const Objective = require('../models/Objective');
const buildTeamTree = require('../utils/buildTeamTree');

// GET /teams
router.get('/', isSuperAdmin, async (req, res) => {
  const allTeams = await Team.find({ organization: req.organization._id })
    .populate('functionHead okrEditors parentTeam');

  const users = await User.find({ organization: req.organization._id });

  res.render('teams/index', {
    orgName: req.organization.orgName,
    allTeams,
    users
  });
});

// GET form to create team
router.get('/new', isSuperAdmin, async (req, res) => {
  const users = await User.find({ organization: req.organization._id });
  const allTeams = await Team.find({ organization: req.organization._id })
    .populate('functionHead okrEditors parentTeam');

  const preselectedParentTeamId = req.query.parentTeam || null;

  res.render('teams/new', {
    orgName: req.organization.orgName,
    users,
    allTeams,
    preselectedParentTeamId
  });
});

// CREATE a team
router.post('/', isSuperAdmin, async (req, res) => {
  try {
    const { name, parentTeam, functionHead, okrEditors } = req.body;

    const team = new Team({
      name,
      parentTeam: parentTeam || null,
      functionHead: functionHead || null,
      okrEditors: okrEditors || null,
      organization: req.organization._id,
    });

    await team.save();
    req.flash('success', 'Team created successfully');
    res.redirect(`/${req.organization.orgName}/teams`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create team');
    res.redirect(`/${req.organization.orgName}/teams`);
  }
});

// READ single team (rendered page)
router.get('/:teamId', async (req, res) => {
  try {
    const team = await Team.findOne({
      _id: req.params.teamId,
      organization: req.organization._id
    }).populate('functionHead okrEditors parentTeam', 'name email');

    if (!team) {
      req.flash('error', 'Team not found');
      return res.redirect(`/${req.organization.orgName}/teams`);
    }

    res.render('teams/show', { orgName: req.organization.orgName, team, user: req.user });
  } catch (err) {
    req.flash('error', 'Failed to fetch team');
    res.redirect(`/${req.organization.orgName}/teams`);
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
// UPDATE team
router.put('/:teamId', isSuperAdmin, async (req, res) => {
  try {
    // Normalize okrEditors to an array
    if (req.body.okrEditors && !Array.isArray(req.body.okrEditors)) {
      req.body.okrEditors = [req.body.okrEditors];
    }

    // Remove empty string from parentTeam
    if (req.body.parentTeam === '') {
      delete req.body.parentTeam;
    }

    // 🔥 Remove empty string from functionHead
    if (req.body.functionHead === '') {
      delete req.body.functionHead;
    }

    const updatedTeam = await Team.findOneAndUpdate(
      { _id: req.params.teamId, organization: req.organization._id },
      req.body,
      { new: true }
    ).populate('functionHead okrEditors parentTeam', 'name email');

    if (!updatedTeam) {
      req.flash('error', 'Team not found');
      return res.redirect(`/${req.organization.orgName}/teams`);
    }

    req.flash('success', 'Team updated successfully');
    res.redirect(`/${req.organization.orgName}/teams`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update team');
    res.redirect(`/${req.organization.orgName}/teams`);
  }
});

// DELETE (deactivate) team
router.delete('/:teamId', isSuperAdmin, async (req, res) => {
  try {
    const teamId = req.params.teamId;

    const hasChildren = await Team.exists({
      parentTeam: teamId,
      organization: req.organization._id,
      activeTeam: true
    });

    if (hasChildren) {
      req.flash('error', 'This team has sub-teams. Reassign or remove them first.');
      return res.redirect(`/${req.organization.orgName}/teams`);
    }

    const hasUsers = await User.exists({
      team: teamId,
      organization: req.organization._id,
      isActive: true
    });

    if (hasUsers) {
      req.flash('error', 'This team has users assigned. Please reassign or deactivate them first.');
      return res.redirect(`/${req.organization.orgName}/teams`);
    }

    const isTaggedInObjective = await Objective.exists({
      teamId: teamId,
      organization: req.organization._id
    });

    if (isTaggedInObjective) {
      req.flash('error', 'This team is tagged to an objective. Please update the objective before deletion.');
      return res.redirect(`/${req.organization.orgName}/teams`);
    }

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
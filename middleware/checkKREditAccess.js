// 🚀 New middleware: checkKREditAccess.js
const KeyResult = require('../models/KeyResult');
const Team = require('../models/Team');
const User = require('../models/User');
const getAllSubTeams = require('../utils/getAllSubTeams');

async function checkKREditAccess(req, res, next) {
  const { krId } = req.params;
  const user = req.user;

  try {
    const kr = await KeyResult.findOne({ _id: krId, organization: req.organization._id })
      .populate('ownerTeam assignedTeams assignedTo');

    if (!kr) {
      req.flash('error', 'Key Result not found');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }

    const isSuperAdmin = user.isSuperAdmin;
    const isAssignedUser = kr.assignedTo.some(u => u._id.toString() === user._id.toString());

    // Get all teams where user is function head or OKR editor
    const accessibleTeamIds = await getAllSubTeams(user.team);
    accessibleTeamIds.push(user.team.toString());
    const functionTeams = await Team.find({
      _id: { $in: accessibleTeamIds },
      organization: req.organization._id,
      $or: [
        { functionHead: user._id },
        { okrEditors: user._id }
      ]
    });
    const accessibleTeamIdStrings = functionTeams.map(t => t._id.toString());

    const isOwnerTeam = kr.ownerTeam && accessibleTeamIdStrings.includes(kr.ownerTeam.toString());
    const isAssignedTeam = kr.assignedTeams.some(teamId => accessibleTeamIdStrings.includes(teamId.toString()));

    if (isSuperAdmin || isAssignedUser || isOwnerTeam || isAssignedTeam) {
      req.keyResult = kr;
      return next();
    } else {
      req.flash('error', 'You do not have permission to edit this Key Result.');
      return res.redirect(`/${req.organization.orgName}/objectives`);
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error validating edit permission.');
    return res.redirect(`/${req.organization.orgName}/objectives`);
  }
}

module.exports = checkKREditAccess;
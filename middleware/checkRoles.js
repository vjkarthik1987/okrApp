const Team = require('../models/Team');
const User = require('../models/User');

const handleAccessDenied = (req, res, message = 'Access denied.') => {
  if (req.accepts('html')) {
    req.flash('error', message);
    return res.redirect(`/${req.organization?.orgName || 'dashboard'}/dashboard`);
  } else {
    return res.status(403).json({ error: message });
  }
};

// ✅ Check if user is super admin
exports.isSuperAdmin = (req, res, next) => {
  if (req.user?.isSuperAdmin) return next();
  return handleAccessDenied(req, res, 'Access denied. Super admin only.');
};

// ✅ Check if user is super admin or editing their own record
exports.canEditOwnOrSuperAdmin = (req, res, next) => {
  if (req.user?.isSuperAdmin || req.user._id.toString() === req.params.userId) return next();
  return handleAccessDenied(req, res, 'You are not allowed to edit this user.');
};

// ✅ Check if user can edit objectives/KRs for a specific team
exports.isSuperAdminOrFunctionEditor = async (req, res, next) => {
  const user = req.user;
  if (user.isSuperAdmin) return next();

  try {
    const teamIds =
      req.body.assignedTeams ||
      req.body.objective?.assignedTeams ||
      req.objective?.assignedTeams;

    const normalizedTeamIds = Array.isArray(teamIds) ? teamIds : [teamIds].filter(Boolean);

    if (!normalizedTeamIds || normalizedTeamIds.length === 0) {
      req.flash('error', 'No assigned teams found for access check.');
      return res.redirect(`/${req.organization.orgName}/dashboard`);
    }

    const teams = await Team.find({ _id: { $in: normalizedTeamIds } });

    const hasAccess = teams.some(team => {
      return (
        team.functionHead?.toString() === user._id.toString() ||
        team.okrEditors?.some(editorId => editorId.toString() === user._id.toString())
      );
    });

    if (hasAccess) return next();

    req.flash('error', 'Access denied. You must be Function Head or OKR Editor of one of the assigned teams.');
    return res.redirect(`/${req.organization.orgName}/dashboard`);

  } catch (err) {
    console.error('Role check failed:', err);
    req.flash('error', 'Internal server error during role check.');
    return res.redirect(`/${req.organization.orgName}/dashboard`);
  }
};


exports.isManager = async (req, res, next) => {
  if (!req.user) {
    return handleAccessDenied(req, res, 'Not logged in.');
  }

  try {
    const reportees = await User.find({
      organization: req.organization._id,
      manager: req.user._id,
      isActive: true
    }).select('_id');

    if (reportees.length > 0) {
      return next();
    } else {
      return handleAccessDenied(req, res, 'Access denied. You do not have direct reports.');
    }
  } catch (err) {
    console.error('Error checking manager role:', err);
    return handleAccessDenied(req, res, 'Internal error while checking manager role.');
  }
};
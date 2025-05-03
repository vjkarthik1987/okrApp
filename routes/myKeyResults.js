const express = require('express');
const router = express.Router({ mergeParams: true });
const KeyResult = require('../models/KeyResult');
const Objective = require('../models/Objective');
const Team = require('../models/Team');
const getAllSubTeams = require('../utils/getAllSubTeams');
const { isLoggedIn } = require('../middleware/auth');

// GET /:orgName/mykeyresults?scope=my|team|org&filter=active|completed|all
router.get('/', isLoggedIn, async (req, res) => {
  const scope = req.query.scope || 'my';
  const filter = req.query.filter || 'active';
  const userId = req.user._id;
  const orgId = req.organization._id;
  let query = { organization: orgId };

  try {
    if (scope === 'my') {
      query.assignedTo = userId;
    } else if (scope === 'team') {
      const userTeamId = req.user.team;
      const subTeams = await getAllSubTeams(userTeamId);
      const allTeamIds = [userTeamId, ...subTeams.map(t => t._id)].map(id => id.toString());
      query.assignedTeams = { $in: allTeamIds };
    } // org scope shows everything

    if (filter === 'active') {
      query.progressValue = { $lt: 100 };
    } else if (filter === 'completed') {
      query.progressValue = 100;
    }

    const keyResults = await KeyResult.find(query)
      .populate('objectiveId', 'title')
      .lean();

    keyResults.forEach(kr => {
      kr.objectiveTitle = kr.objectiveId?.title || '—';
    });

    res.render('myKeyResults/index', {
      orgName: req.organization.orgName,
      user: req.user,
      keyResults,
      scope,
      filter
    });
  } catch (err) {
    console.error('Failed to load My Key Results:', err);
    req.flash('error', 'Unable to load key results');
    res.redirect(`/${req.organization.orgName}/dashboard`);
  }
});

module.exports = router;

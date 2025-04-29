const KeyResult = require('../models/KeyResult');
const Objective = require('../models/Objective');
const { canEditKR } = require('../utils/permissions');

async function checkKREditPermission(req, res, next) {
  const kr = await KeyResult.findById(req.params.krId);
  if (!kr) {
    req.flash('error', 'Key Result not found');
    return res.redirect('back');
  }

  const objective = await Objective.findById(kr.objectiveId);
  if (!objective) {
    req.flash('error', 'Objective not found');
    return res.redirect('back');
  }

  if (!canEditKR(req.user, kr, objective)) {
    req.flash('error', 'You do not have permission to edit this Key Result.');
    return res.redirect('back');
  }

  req.kr = kr;
  req.objective = objective;
  next();
}

module.exports = { checkKREditPermission };

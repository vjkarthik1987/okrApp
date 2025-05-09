// File: utils/checkRoles.js
function isSuperAdmin(req, res, next) {
  if (req.user?.isSuperAdmin) return next();
  req.flash('error', 'Access denied');
  res.redirect('/');
}
module.exports = { isSuperAdmin };

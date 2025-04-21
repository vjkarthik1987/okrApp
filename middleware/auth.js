// middleware/auth.js

exports.isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    const orgName = req.params.orgName || (req.organization && req.organization.orgName) || 'unknown';
    res.redirect(`/${orgName}/auth/login`);
  };
  
// Only super admin can access
exports.isSuperAdmin = (req, res, next) => {
    const user = req.user;
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied. Super admin only.' });
    }
    next();
  };
  
  // Super admin or the user themselves can update
  exports.canEditOwnOrSuperAdmin = (req, res, next) => {
    const currentUser = req.user;
    const targetUserId = req.params.userId;
  
    if (
      currentUser.role === 'super_admin' ||
      currentUser._id.toString() === targetUserId
    ) {
      return next();
    }
  
    return res.status(403).json({ error: 'You are not allowed to update this user.' });
};  

exports.isSuperAdminOrFunctionEditor = (req, res, next) => {
  const user = req.user;
  if (!user || !['super_admin', 'function_head', 'okr_editor'].includes(user.role)) {
    return res.status(403).json({ error: 'Access denied. Only editors or admins can create objectives.' });
  }
  next();
};

// routes/superAdmins.js
const express = require('express');
const router = express.Router({ mergeParams: true });
const User = require('../models/User');
const { isSuperAdmin } = require('../middleware/checkRoles'); // or your checkRoles.js

// Show SuperAdmin Management Page
router.get('/', isSuperAdmin, async (req, res) => {
  const orgId = req.organization._id;

  const users = await User.find({ organization: orgId, isActive: true }).select('name email isSuperAdmin').lean();
  const superAdmins = users.filter(user => user.isSuperAdmin);

  res.render('superAdmins/index', {
    orgName: req.organization.orgName,
    allUsers: users,
    superAdmins: superAdmins,
    user: req.user
  });
});

// Update SuperAdmins
router.post('/', isSuperAdmin, async (req, res) => {
    const { selectedSuperAdmins } = req.body;
    const orgId = req.organization._id;

    try {
        const selectedIds = JSON.parse(selectedSuperAdmins); // 🔥 it's a stringified array

        // Step 1: First, unset isSuperAdmin for ALL users in org
        await User.updateMany(
        { organization: orgId },
        { $set: { isSuperAdmin: false } }
        );

        // Step 2: Now, set isSuperAdmin for selected users
        await User.updateMany(
        { _id: { $in: selectedIds }, organization: orgId },
        { $set: { isSuperAdmin: true } }
        );

        req.flash('success', 'Super Admins updated successfully');
        res.redirect(`/${req.organization.orgName}/superAdmins`);
    } catch (err) {
        console.error('Error updating super admins:', err);
        req.flash('error', 'Failed to update super admins.');
        res.redirect(`/${req.organization.orgName}/superAdmins`);
    }
});
  
module.exports = router;
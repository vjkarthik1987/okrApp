const express = require('express');
const router = express.Router({ mergeParams: true });
const User = require('../models/User');
const Team = require('../models/Team');
const Objective = require('../models/Objective');
const passport = require('passport');
const { isSuperAdmin } = require('../middleware/checkRoles');

// GET all users (active and inactive)
router.get('/', isSuperAdmin, async (req, res) => {
  const activeUsers = await User.find({
    organization: req.organization._id,
    isActive: true
  });

  const inactiveUsers = await User.find({
    organization: req.organization._id,
    isActive: false
  });

  res.render('users/index', {
    users: activeUsers,
    inactiveUsers,
    orgName: req.organization.orgName,
    user: req.user
  });
});


// GET Form to Create Users (bulk support)
router.get('/new', isSuperAdmin, (req, res) => {
  res.render('users/new', { orgName: req.organization.orgName, user: req.user });
});

// POST Create Users
router.post('/', isSuperAdmin, async (req, res) => {
  try {
    const { bulkUsers } = req.body;
    const lines = bulkUsers.split('\n');
    const created = [];

    for (const line of lines) {
      const [name, email, role, location, designation, band, gender] = line.split(',').map(s => s.trim());
      const password = email.split('@')[0];

      const user = new User({
        name,
        email,
        role: role || 'employee',
        location,
        designation,
        band,
        gender,
        organization: req.organization._id
      });

      const registeredUser = await User.register(user, password);
      created.push(registeredUser);
    }

    req.flash('success', `${created.length} user(s) created successfully`);
    res.redirect(`/${req.organization.orgName}/users`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create users');
    res.redirect(`/${req.organization.orgName}/users/new`);
  }
});

// GET Edit User
router.get('/:id/edit', isSuperAdmin, async (req, res) => {
  const userToEdit = await User.findOne({ _id: req.params.id, organization: req.organization._id });
  if (!userToEdit) {
    req.flash('error', 'User not found');
    return res.redirect(`/${req.organization.orgName}/users`);
  }
  res.render('users/edit', { userToEdit, orgName: req.organization.orgName, user: req.user });
});

// PUT Update User
router.put('/:id', isSuperAdmin, async (req, res) => {
  try {
    await User.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      req.body
    );
    req.flash('success', 'User updated');
    res.redirect(`/${req.organization.orgName}/users`);
  } catch (err) {
    req.flash('error', 'Failed to update user');
    res.redirect(`/${req.organization.orgName}/users`);
  }
});

// DELETE (soft delete) a user
router.delete('/:id', isSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    console.log(userId);

    const user = await User.findOne({
      _id: userId,
      organization: req.organization._id
    });

    console.log(user);

    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect(`/${req.organization.orgName}/users`);
    }

    // 🔁 Move logs AFTER user is defined
    console.log("Deactivating user:", user.email);

    // ... validations ...

    const updatedUser = await User.findByIdAndUpdate(userId, { isActive: false });
    console.log("Deactivated successfully:", updatedUser.email);

    req.flash('success', 'User deactivated successfully');
    res.redirect(`/${req.organization.orgName}/users`);

  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to deactivate user');
    res.redirect(`/${req.organization.orgName}/users`);
  }
});

// Reactivate a deactivated user
router.post('/:id/reactivate', isSuperAdmin, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { isActive: true }
    );

    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect(`/${req.organization.orgName}/users`);
    }

    req.flash('success', 'User reactivated successfully');
    res.redirect(`/${req.organization.orgName}/users`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to reactivate user');
    res.redirect(`/${req.organization.orgName}/users`);
  }
});

module.exports = router;
const express = require('express');
const router = express.Router({ mergeParams: true });
const User = require('../models/User');
const Team = require('../models/Team');
const passport = require('passport');
const { isSuperAdmin } = require('../middleware/checkRoles');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const csv = require('csv-parser'); // We'll use csv-parser for reading CSV
const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];

// ➡️ Small helpers to adjust numberOfReportees
async function incrementReportees(managerId) {
  if (managerId) {
    await User.findByIdAndUpdate(managerId, { $inc: { numberOfReportees: 1 } });
  }
}

async function decrementReportees(managerId) {
  if (managerId) {
    await User.findByIdAndUpdate(managerId, { $inc: { numberOfReportees: -1 } });
  }
}

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

  const skippedUsers = req.session.skippedUsers || [];
  delete req.session.skippedUsers;

  res.render('users/index', {
    users: activeUsers,
    inactiveUsers,
    orgName: req.organization.orgName,
    user: req.user,
    skippedUsers
  });
});

// GET form to create users
router.get('/new', isSuperAdmin, (req, res) => {
  res.render('users/new', { orgName: req.organization.orgName, user: req.user });
});

// POST create users
router.post('/', isSuperAdmin, upload.single('csvFile'), async (req, res) => {
  try {
    const userEntries = [];
    const nameToUserMap = {};
    const skippedUsers = [];

    if (req.file && req.body.bulkUsers && req.body.bulkUsers.trim() !== '') {
      req.flash('error', 'Please either paste users OR upload a CSV — not both.');
      return res.redirect(`/${req.organization.orgName}/users/new`);
    }

    let linesOrRows = [];
    if (req.file) {
      const csvText = req.file.buffer.toString('utf-8');
      linesOrRows = csvText.split('\n').filter(line => line.trim() !== '');
    } else if (req.body.bulkUsers) {
      linesOrRows = req.body.bulkUsers.split('\n').filter(line => line.trim() !== '');
    } else {
      req.flash('error', 'No user data provided.');
      return res.redirect(`/${req.organization.orgName}/users/new`);
    }

    for (const line of linesOrRows) {
      const [name, email, role, location, designation, band, gender, joiningDate, managerName, teamName] = line.split(',').map(s => s.trim());

      let parsedDate = joiningDate ? new Date(joiningDate) : undefined;
      if (parsedDate && parsedDate.toString() === 'Invalid Date') {
        parsedDate = undefined;
      }

      const genderValue = validGenders.includes(gender) ? gender : 'Prefer not to say';

      userEntries.push({
        name,
        email,
        role: role || 'employee',
        location,
        designation,
        band,
        gender: genderValue,
        joiningDate: parsedDate,
        managerName,
        teamName
      });
    }

    for (const entry of userEntries) {
      try {
        const password = entry.email.split('@')[0];

        let team = null;
        if (entry.teamName) {
          team = await Team.findOne({ name: entry.teamName, organization: req.organization._id });
        }

        if (!team) {
          skippedUsers.push({ name: entry.name, email: entry.email, reason: 'Team not found' });
          continue;
        }

        const user = new User({
          name: entry.name,
          email: entry.email,
          role: entry.role,
          location: entry.location,
          designation: entry.designation,
          band: entry.band,
          gender: entry.gender,
          joiningDate: entry.joiningDate,
          team: team._id,
          organization: req.organization._id,
          isActive: true
        });

        const registeredUser = await User.register(user, password);
        nameToUserMap[registeredUser.name.trim()] = registeredUser;

      } catch (err) {
        if (err.name === 'UserExistsError') {
          skippedUsers.push({ name: entry.name, email: entry.email, reason: 'Duplicate email' });
        } else {
          skippedUsers.push({ name: entry.name, email: entry.email, reason: 'Other error' });
        }
        continue;
      }
    }

    for (const entry of userEntries) {
      const employee = nameToUserMap[entry.name.trim()];
      if (employee && entry.managerName) {
        const manager = await User.findOne({
          name: { $regex: new RegExp(`^${entry.managerName.trim()}$`, 'i') },
          organization: req.organization._id
        });

        if (manager) {
          employee.manager = manager._id;
          await employee.save();
          await incrementReportees(manager._id); // 🔥 update manager's reportees
        }
      }
    }

    const successCount = Object.keys(nameToUserMap).length;
    req.session.skippedUsers = skippedUsers;

    req.flash('success', `${successCount} user(s) created successfully.`);
    res.redirect(`/${req.organization.orgName}/users`);

  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong while creating users.');
    res.redirect(`/${req.organization.orgName}/users/new`);
  }
});

// GET Edit User
router.get('/:id/edit', isSuperAdmin, async (req, res) => {
  const userToEdit = await User.findOne({ _id: req.params.id, organization: req.organization._id }).populate('manager');

  if (!userToEdit) {
    req.flash('error', 'User not found');
    return res.redirect(`/${req.organization.orgName}/users`);
  }

  const allUsers = await User.find({
    _id: { $ne: userToEdit._id },
    organization: req.organization._id,
    isActive: true
  }).sort({ name: 1 });

  // 👇 Add logic to calculate disableRoleEdit
  const superAdminCount = await User.countDocuments({ organization: req.organization._id, role: 'super_admin', isActive: true });
  const disableRoleEdit = (userToEdit.role === 'super_admin' && superAdminCount <= 1);

  res.render('users/edit', {
    userToEdit,
    orgName: req.organization.orgName,
    user: req.user,
    allUsers,
    disableRoleEdit // 🔥 Pass this
  });
});

// PUT Update User
router.put('/:id', isSuperAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organization: req.organization._id });

    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect(`/${req.organization.orgName}/users`);
    }

    const oldManagerId = user.manager ? user.manager.toString() : null;
    const newManagerId = req.body.manager;

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.location = req.body.location || user.location;
    user.designation = req.body.designation || user.designation;
    user.band = req.body.band || user.band;
    user.gender = req.body.gender || user.gender;
    user.joiningDate = req.body.joiningDate || user.joiningDate;
    user.manager = newManagerId || null;
    await user.save();

    if (oldManagerId !== newManagerId) {
      await decrementReportees(oldManagerId);
      await incrementReportees(newManagerId);
    }

    req.flash('success', 'User updated');
    res.redirect(`/${req.organization.orgName}/users`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update user');
    res.redirect(`/${req.organization.orgName}/users`);
  }
});

// DELETE (soft delete) a user
router.delete('/:id', isSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findOne({
      _id: userId,
      organization: req.organization._id
    });

    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect(`/${req.organization.orgName}/users`);
    }

    if (user.manager) {
      await decrementReportees(user.manager); // 🔥 decrement manager's reportees
    }

    await User.findByIdAndUpdate(userId, { isActive: false });

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
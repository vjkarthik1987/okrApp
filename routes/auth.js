const express = require('express');
const router = express.Router({ mergeParams: true });
const passport = require('passport');
const User = require('../models/User');
const {isLoggedIn} = require('../middleware/auth')

//Authenticate user
router.get('/login', (req, res) => {
  res.render('auth/login', { orgName: req.params.orgName });
});

//Register a new user
router.post('/register', async (req, res) => {
  const org = req.organization; // From loadOrg middleware

  const {
    name,
    email,
    password,
    role, // should be explicitly sent
    location,
    designation,
    band,
    gender,
    joiningDate,
    manager  // optional: for tagging manager
  } = req.body;

  try {
    // Check if user already exists in this organization
    const existingUser = await User.findOne({ email, organization: org._id });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists in the organization' });
    }

    const user = new User({
      name,
      email,
      role: role || 'employee', // default to 'employee' if not provided
      location,
      designation,
      band,
      gender,
      joiningDate,
      manager,
      organization: org._id
    });

    const registeredUser = await User.register(user, password);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        _id: registeredUser._id,
        name: registeredUser.name,
        email: registeredUser.email,
        role: registeredUser.role,
        organization: org.orgName
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// Login user to POST /:orgName/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const org = req.organization;

  try {
    // Step 1: Find user by email + org
    const user = await User.findOne({ email, organization: org._id });

    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect(`/${org.orgName}/auth/login`);
    }
    
    if (!user.isActive) {
      req.flash('error', 'Your account is deactivated. Please contact your admin.');
      return res.redirect(`/${org.orgName}/auth/login`);
    }
    
    if (user.organization.toString() !== org._id.toString()) {
      req.flash('error', 'Organization mismatch');
      return res.redirect(`/${org.orgName}/auth/login`);
    }
      
    // Step 2: Use passport-local-mongoose's authenticate method manually
    user.authenticate(password, (err, userObj, passwordErr) => {
      if (err || passwordErr) {
        console.log('Password mismatch');
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      req.login(userObj, (err) => {
        if (err) {
          console.log('Login error');
          return res.status(500).json({ error: 'Login failed' });
        }
        res.redirect(`/${org.orgName}/dashboard`);
      });
    });

  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

//Logout
router.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }

    req.flash('success', 'You have been logged out.');
    res.redirect(`/${req.params.orgName}/auth/login`);
  });
});

//Get change password form
router.get('/change-password', isLoggedIn, (req, res) => {
  res.render('auth/changePassword', { orgName: req.organization.orgName, user: req.user });
});

// Handle password change
router.post('/change-password', isLoggedIn, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    req.flash('error', 'New passwords do not match');
    return res.redirect(`/${req.organization.orgName}/auth/change-password`);
  }

  try {
    const user = await User.findById(req.user._id);
    user.changePassword(currentPassword, newPassword, (err) => {
      if (err) {
        req.flash('error', 'Current password incorrect or update failed');
        return res.redirect(`/${req.organization.orgName}/auth/change-password`);
      }
      req.flash('success', 'Password changed successfully');
      res.redirect(`/${req.organization.orgName}/dashboard`);
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong');
    res.redirect(`/${req.organization.orgName}/auth/change-password`);
  }
});
module.exports = router;
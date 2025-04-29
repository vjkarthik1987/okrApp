const express = require('express');
const router = express.Router();
const Organization = require('../models/Organization');
const User = require('../models/User');

// Get Route for registering new organization
router.get('/', (req, res) => {
  res.render('auth/registerOrg');
});

// Post Route for registering new organization
router.post('/', async (req, res) => {
  const {
    orgName,
    displayName,
    industry,
    adminName,
    adminEmail,
    adminPassword,
    location,
    designation,
    band,
    gender,
    joiningDate
  } = req.body;

  try {
    // Check if orgName is taken
    const existingOrg = await Organization.findOne({ orgName });
    if (existingOrg) {
      req.flash('error', 'Organization name is already taken');
      return res.redirect('/register-org');
    }

    // Set license start and end date (6 months + 10 days)
    const licenseStartDate = new Date();
    const licenseEndDate = new Date(licenseStartDate);
    licenseEndDate.setDate(licenseEndDate.getDate() + (6 * 30 + 10));

    // Create new organization
    const org = new Organization({
      orgName,
      displayName,
      industry,
      financialYearStartMonth: req.body.financialYearStartMonth || 1,
      licenseModel: 'free',
      licenseActivated: false,
      licenseStartDate,
      licenseEndDate,
      numberOfUsers: 1,
      active: true
    });

    await org.save();

    // Check if user already exists globally
    let user = await User.findOne({ email: adminEmail });

    if (!user) {
      // User does NOT exist — create new user
      user = new User({
        name: adminName,
        email: adminEmail,
        isSuperAdmin: true,
        isActive: true,
        location,
        designation,
        band,
        gender,
        joiningDate,
        organization: org._id
      });

      await user.setPassword(adminPassword);
      await user.save();
    } else {
      // User exists — link to new organization
      // Create a copy with new organization
      const newUser = new User({
        name: user.name || adminName,
        email: user.email,
        isSuperAdmin: true,
        isActive: true,
        location: location || user.location,
        designation: designation || user.designation,
        band: band || user.band,
        gender: gender || user.gender,
        joiningDate: joiningDate || user.joiningDate,
        organization: org._id
      });

      // Set a temporary password if needed, or reuse password hash (optional)
      await newUser.setPassword(adminPassword);  // Safe: password user just entered
      await newUser.save();
    }

    req.flash('success', 'Organization registered successfully! Please login.');
    res.redirect(`/${org.orgName}/auth/login`);

  } catch (err) {
    console.error(err);
    req.flash('error', 'Organization registration failed. Please try again.');
    res.redirect('/register-org');
  }
});

module.exports = router;
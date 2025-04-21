const express = require('express');
const router = express.Router();
const Organization = require('../models/Organization');
const User = require('../models/User');

//Get Route for registering new organization
router.get('/', (req, res) => {
  res.render('auth/registerOrg');
});

//Post Route for registering new organization
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
      return res.status(400).json({ error: 'Organization name is already taken' });
    }

    // Set license start and end date (6 months + 10 days)
    const licenseStartDate = new Date();
    const licenseEndDate = new Date(licenseStartDate);
    licenseEndDate.setDate(licenseEndDate.getDate() + (6 * 30 + 10)); // approx 190 days

    // Create organization
    const org = new Organization({
      orgName,
      displayName,
      industry,
      licenseModel: 'free',
      licenseActivated: false,
      licenseStartDate,
      licenseEndDate,
      numberOfUsers: 1,
      active: true
    });

    await org.save();

    // Create first user as super_admin
    const user = new User({
      name: adminName,
      email: adminEmail,
      organization: org._id,
      role: 'super_admin',
      location,
      designation,
      band,
      gender,
      joiningDate
    });

    const registeredUser = await User.register(user, adminPassword);
    req.flash('success', 'Organization registered! Please login.')
    res.redirect(`/${org.orgName}/auth/login`);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Organization registration failed', details: err.message });
  }
});

module.exports = router;
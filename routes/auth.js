const express = require('express');
const router = express.Router({ mergeParams: true });
const passport = require('passport');
const User = require('../models/User');
const {isLoggedIn} = require('../middleware/auth')
const crypto = require('crypto');
const nodemailer = require('nodemailer');


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
        req.flash('error', '❌ Incorrect email or password. Please try again.');
        return res.redirect(`/${org.orgName}/auth/login`);
      }
    
      req.login(userObj, (err) => {
        if (err) {
          console.log('Login error');
          req.flash('error', '❌ Incorrect email or password. Please try again.');
          return res.redirect(`/${org.orgName}/auth/login`);
        }
    
        res.redirect(`/${org.orgName}/dashboard`);
      });
    });
    
  } catch (err) {
    console.error('Login failed:', err);
    req.flash('error', '❌ Incorrect email or password. Please try again.');
    res.redirect(`/${orgName}/auth/login`);;
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

//Show forgot password page
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgotPassword', { orgName: req.params.orgName });
});

//Reset password email confirmation
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const org = req.organization;

  try {
    const user = await User.findOne({ email, organization: org._id });

    if (!user) {
      req.flash('error', 'No user with that email in this organization');
      return res.redirect(`/${org.orgName}/auth/forgot-password`);
    }

    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetLink = `${req.protocol}://${req.get('host')}/${org.orgName}/auth/reset/${token}`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.OFFICE_365_EMAIL,
        pass: process.env.OFFICE_365_PASSWORD
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      }
    });

    await transporter.sendMail({
      to: user.email,
      from: `${process.env.OFFICE_365_EMAIL}`,
      subject: 'Reset your password',
      html: `<p>You requested a password reset. Click <a href="${resetLink}">here</a> to reset it.</p>`
    });

    req.flash('success', 'A reset link has been sent to your email.');
    res.redirect(`/${org.orgName}/auth/login`);
  } catch (err) {
    console.error('Forgot password error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect(`/${org.orgName}/auth/forgot-password`);
  }
});

//Show password reset form
router.get('/reset/:token', async (req, res) => {
  const token = req.params.token;
  const orgName = req.params.orgName;

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    req.flash('error', 'Reset token is invalid or has expired.');
    return res.redirect(`/${orgName}/auth/forgot-password`);
  }

  res.render(`auth/resetPassword`, { token, orgName });
});

//Handle reset password
router.post('/reset/:token', async (req, res) => {
  const { password, confirm } = req.body;
  const orgName = req.params.orgName;

  if (password !== confirm) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('back');
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.flash('error', 'Reset token is invalid or has expired.');
      return res.redirect(`/${orgName}/auth/forgot-password`);
    }

    await user.setPassword(password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.OFFICE_365_EMAIL,
        pass: process.env.OFFICE_365_PASSWORD
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      }
    });

    await transporter.sendMail({
      to: user.email,
      from: `${process.env.OFFICE_365_EMAIL}`,
      subject: 'Your password has been changed',
      html: `<p>Your password for ${orgName} has been successfully updated.</p>`
    });

    req.flash('success', 'Your password has been reset. You can now log in.');
    res.redirect(`/${orgName}/auth/login`);
  } catch (err) {
    console.error('Reset error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect(`/${orgName}/auth/forgot-password`);
  }
});
module.exports = router;
// File: routes/assistant.js
const express = require('express');
const router = express.Router({ mergeParams: true });

const { isSuperAdmin } = require('../utils/checkRoles');
const { isLoggedIn } = require('../middleware/auth');

// Render assistant UI at '/'
router.get('/', isLoggedIn, async (req, res) => {
  res.render('assistant/index', {
    orgName: req.params.orgName
  });
});

// Assistant logs, only accessible to superAdmin
router.get('/logs', isLoggedIn, isSuperAdmin, async (req, res) => {
  const logs = await QueryLog.find({ organization: req.user.organization })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('user');

  res.render('assistant/logs', {
    logs,
    orgName: req.params.orgName,
    title: 'Assistant Logs'
  });
});

module.exports = router;
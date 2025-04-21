const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware/auth');

router.get('/', isLoggedIn, (req, res) => {
  res.render('dashboard/index', {
    orgName: req.organization.orgName,
    user: req.user
  });
});

module.exports = router;

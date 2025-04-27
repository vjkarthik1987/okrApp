const express = require('express');
const router = express.Router({ mergeParams: true });
const User = require('../models/User');
const { isLoggedIn } = require('../middleware/auth');
const { isManager } = require('../middleware/checkRoles');

router.get('/', isLoggedIn, isManager, async (req, res) => {
    try {
        const allUsers = await User.find({
        organization: req.organization._id,
        isActive: true
        }).lean();

        const userMap = {};
        allUsers.forEach(user => {
        user.reportees = [];
        userMap[user._id.toString()] = user;
        });

        allUsers.forEach(user => {
        if (user.manager && user._id.toString() !== user.manager.toString()) {
            const manager = userMap[user.manager.toString()];
            if (manager) {
            manager.reportees.push(user);
            }
        }
        });

        const teamTree = userMap[req.user._id.toString()]?.reportees || [];
        const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth) : null;

        res.render('managerDashboard/index', {
        orgName: req.organization.orgName,
        user: req.user,
        teamTree,
        maxDepth
        });

    } catch (err) {
        console.error('Error loading Manager Dashboard:', err);
        req.flash('error', 'Failed to load Manager Dashboard.');
        res.redirect(`/${req.organization.orgName}/dashboard`);
    }
});

module.exports = router;
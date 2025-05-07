const express = require('express');
const router = express.Router({ mergeParams: true });
const { isSuperAdmin } = require('../middleware/checkRoles');
const { isLoggedIn } = require('../middleware/auth');
const Team = require('../models/Team');
const WeekCycle = require('../models/WeekCycle');
const Objective = require('../models/Objective');
const KeyResult = require('../models/KeyResult');
const ActionItem = require('../models/ActionItem');
const DiaryEntry = require('../models/DiaryEntry');
const TeamWeeklyUpdate = require('../models/TeamWeeklyUpdate');
const User = require('../models/User');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const generateKRPrompt = require('../prompts/summaryWeeklyUpdateKRs');

// 🌟 SuperAdmin Weekly Update Generator UI
router.get('/new', isLoggedIn, isSuperAdmin, async (req, res) => {
  try {
    const teams = await Team.find({ organization: req.organization._id, activeTeam: true });
    const weekCycles = await WeekCycle.find().sort({ startDate: -1 });
    res.render('weeklyUpdates/new', { orgName: req.organization.orgName, teams, weekCycles, preview: null });
  } catch (err) {
    console.error('Error loading weekly update form:', err);
    req.flash('error', 'Failed to load weekly update form');
    res.redirect('back');
  }
});

// 🌟 Process and Generate Weekly Summary for Selected Team + Week
router.post('/generate', isLoggedIn, isSuperAdmin, async (req, res) => {
  const { teamId, weekCycle: weekCycleId } = req.body;
  try {
    const week = await WeekCycle.findById(weekCycleId);
    if (!week) throw new Error('Invalid week selected');

    const allKRs = await KeyResult.find({
      organization: req.organization._id,
      $or: [
        { ownerTeam: teamId },
        { assignedTeams: teamId }
      ]
    });


    const keyResults = allKRs.map(kr => {
      const updatesThisWeek = kr.updates.filter(up => up.weekCycle?.toString() === week._id.toString());
      const milestoneUpdatesThisWeek = kr.milestoneUpdates.filter(mu => mu.weekCycle?.toString() === week._id.toString());

      return {
        ...kr.toObject(),
        updatesThisWeek,
        milestoneUpdatesThisWeek
      };
    });

    const actionItems = await ActionItem.find({
      keyResultId: { $in: keyResults.map(kr => kr._id) },
      organization: req.organization._id
    });

    const teamUsers = await User.find({ team: teamId, organization: req.organization._id });
    const diaryEntries = await DiaryEntry.find({
      user: { $in: teamUsers.map(u => u._id) },
      weekCycle: weekCycleId,
      organization: req.organization._id
    });

    // Pre-fill initial summary structure (editable in view)
    const draftUpdate = new TeamWeeklyUpdate({
      teamId,
      weekCycle: week._id,
      weekStart: week.startDate,
      weekEnd: week.endDate,
      objectives: [], // skipping objectives for now
      keyResults: keyResults.map(kr => kr._id),
      actionItems: actionItems.map(ai => ai._id),
      diaryEntryStats: {
        totalExpected: teamUsers.length,
        submitted: diaryEntries.length,
        nonCompliant: teamUsers
          .filter(u => !diaryEntries.find(de => de.user.toString() === u._id.toString()))
          .map(u => u._id)
      },
      organization: req.organization._id
    });

    res.render('weeklyUpdates/compose', {
      orgName: req.organization.orgName,
      draftUpdate,
      objectives: [], // skipping objectives for now
      keyResults,
      actionItems,
      diaryEntries,
      teamUsers,
      teamId,
      weekLabel: week.label
    });
  } catch (err) {
    console.error('Error generating weekly update:', err);
    req.flash('error', 'Failed to generate weekly update');
    res.redirect(`/${req.organization.orgName}/weeklyUpdates/new`);
  }
});

// AI Summary
router.post('/ai-summary', isLoggedIn, isSuperAdmin, async (req, res) => {
    const { teamId, weekCycleId } = req.body;
  
    try {
      const week = await WeekCycle.findById(weekCycleId);
      if (!week) throw new Error('Invalid week cycle');
  
      // Fetch all KRs assigned to or owned by the team
      const krs = await KeyResult.find({
        organization: req.organization._id,
        $or: [{ ownerTeam: teamId }, { assignedTeams: teamId }],
        deactivated: { $ne: true }
      }).populate('objectiveId');
  
      // Construct structured KR data to avoid hallucination
      const krData = krs.map(kr => ({
        title: kr.title,
        progressValue: kr.progressValue,
        dueDate: kr.dueDate,
        metricType: kr.metricType,
        startValue: kr.startValue,
        targetValue: kr.targetValue,
        updates: kr.updates.map(up => ({
          updateValue: up.updateValue,
          updateText: up.updateText,
          updateDate: up.updateDate,
          weekCycle: up.weekCycle
        })),
        milestoneUpdates: kr.milestoneUpdates.map(mu => ({
          milestoneIndex: mu.milestoneIndex,
          completed: mu.completed,
          updateDate: mu.updateDate,
          weekCycle: mu.weekCycle
        }))
      }));
  
      // Generate prompt using clean data
      const prompt = generateKRPrompt({ week, krData });
  
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4
      });
  
      res.json({ summary: response.choices[0].message.content });
  
    } catch (err) {
      console.error('❌ AI Summary Error:', err.stack || err);
      req.flash('error', 'Failed to generate AI summary');
      res.redirect('back');
    }
  });
  
module.exports = router;
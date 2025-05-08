const express = require('express');
const router = express.Router({ mergeParams: true });
const { isLoggedIn } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/checkRoles');

const QueryLog = require('../models/QueryLog');
const detectIntentGPT = require('../utils/detectIntentGPT');
const expandSemanticFrame = require('../utils/expandSemanticFrame');

const getRelevantContext = require('../utils/getRelevantContext');
const handleExternalComparison = require('../utils/handleExternalComparison');

router.get('/', isLoggedIn, async (req, res) => {
  res.render('assistant/index', {
    orgName: req.params.orgName
  });
});

router.post('/', isLoggedIn, async (req, res) => {
  const query = req.body.query;
  const user = req.user;

  try {
    const intent = await detectIntentGPT(query, {
      userId: user._id,
      teamId: user.team,
      orgId: user.organization
    });

    console.log('🧠 Parsed Intent:', intent);

    if (intent.category === 'context') {
      const contextAnswer = await getRelevantContext(query, user.organization);
      return res.json({ response: contextAnswer });

    } else if (intent.category === 'external') {
      const externalAnswer = await handleExternalComparison(query);
      return res.json({ response: externalAnswer });

    } else if (intent.category === 'assistant') {
      return res.json({
        response: 'I can help you track OKRs, summarize progress, find action items, explore team diaries, and answer questions from internal docs or industry benchmarks.'
      });

    } else if (intent.category === 'internal') {
      const plan = await expandSemanticFrame(intent, user);
      if (!plan.model) {
        return res.json({ response: '❌ Could not determine the model for this internal query.' });
      }

      const Model = require(`../models/${plan.model}`);

      // CREATE
      if (plan.action === 'create') {
        if (plan.missingFields && plan.missingFields.length > 0) {
          return res.json({
            response: `⚠️ Missing fields: ${plan.missingFields.join(', ')}. Please provide them to create the ${plan.model}.`
          });
        }

        const created = await Model.create(plan.createFields);
        return res.json({
          response: `✅ Created new ${plan.model}: **${created.title || created.name || created._id}**.`
        });
      }

      // UPDATE
      if (plan.action === 'update') {
        const matches = await Model.find(plan.filter).limit(5).lean();
        if (matches.length === 0) {
          return res.json({ response: `❌ No matching ${plan.model} found to update.` });
        }
        if (matches.length > 1) {
          const preview = matches.map(m => `• ${m.title || m.name || m._id}`).join('\n');
          return res.json({
            response: `⚠️ Found multiple ${plan.model}s. Please clarify:\n${preview}`
          });
        }

        await Model.updateOne({ _id: matches[0]._id }, { $set: plan.updateFields });
        return res.json({
          response: `✅ Updated ${plan.model} **${matches[0].title || matches[0].name}** with the requested changes.`
        });
      }

      // SUMMARIZE / TREND / EXCEPTION
      if (plan.pipeline) {
        const results = await Model.aggregate(plan.pipeline);
        if (!results.length) {
          return res.json({ response: `No data found for ${plan.model} based on current filters.` });
        }

        const lines = results.map(r => `• ${r._id || 'Unknown'}: ${r.count}`).join('\n');
        return res.json({
          response: `📊 ${plan.model} breakdown by **${plan.dimension}**:\n\n${lines}`
        });
      }

      // SEARCH
      const results = await Model.find(plan.filter).limit(25).lean();
      if (!results.length) {
        return res.json({ response: `No matching ${plan.model} found.` });
      }

      const preview = results.slice(0, 5).map(r => `• ${r.title || r.name || r._id}`).join('\n');
      return res.json({
        response: `📦 Found ${results.length} ${plan.model}(s):\n\n${preview}`
      });
    }

    return res.json({ response: `❓ I couldn't interpret that query.` });

  } catch (err) {
    console.error('❌ Assistant Error:', err);
    res.status(500).json({ error: 'Failed to process assistant query' });
  }
});

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

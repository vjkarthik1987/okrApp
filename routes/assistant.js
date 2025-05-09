const express = require('express');
const router = express.Router({ mergeParams: true });
const { isLoggedIn } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/checkRoles');

const QueryLog = require('../models/QueryLog');
const detectIntentGPT = require('../utils/detectIntentGPT');
const expandSemanticFrame = require('../utils/expandSemanticFrame');
const getRelevantContext = require('../utils/getRelevantContext');
const handleExternalComparison = require('../utils/handleExternalComparison');
const naturalFormatter = require('../utils/naturalResponseFormatter');
const resolveAmbiguityPrompt = require('../utils/resolveAmbiguityPrompt');

router.get('/', isLoggedIn, async (req, res) => {
  res.render('assistant/index', {
    orgName: req.params.orgName
  });
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

// Assistant Query
router.post('/s', async (req, res) => {
  const user = req.user;
  const query = req.body.message;

  try {
    const intent = await detectIntentGPT(query, user);
    const frame = await expandSemanticFrame(intent, user);

    if (frame.requiresClarification) {
      return res.send({ reply: `Did you mean one of these ${frame.type}s: ${frame.options.join(', ')}?` });
    }

    if (frame.error) {
      return res.send({ reply: `Error: ${frame.error}` });
    }

    saveContext(req, frame); // Store latest frame for follow-ups

    const results = await fetchFromModel(frame.model, frame.filter); // Your DB query here

    if (!results.length) {
      return res.send({ reply: generateFallbackMessage(frame.model, frame.filter) });
    }

    let reply;
    switch (frame.model) {
      case 'ActionItem': reply = formatActionItemsTable(results); break;
      case 'KeyResult': reply = formatKeyResultsTable(results); break;
      case 'Objective': reply = formatObjectivesTable(results); break;
      case 'DiaryEntry': reply = formatDiaryEntriesTable(results); break;
      default: reply = "I'm not sure how to format that response yet.";
    }

    return res.send({ reply });

  } catch (err) {
    console.error('[Assistant Error]', err);
    return res.status(500).send({ reply: 'Something went wrong while processing your query.' });
  }
});

// Dummy fetch implementation
async function fetchFromModel(model, filter) {
  // Replace with real Mongoose queries
  return [];
}

module.exports = router;

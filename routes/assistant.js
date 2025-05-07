const express = require('express');
const router = express.Router({ mergeParams: true });
const { isLoggedIn } = require('../middleware/auth');
const getRelevantContext = require('../utils/getRelevantContext');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.get('/', isLoggedIn, async (req, res) => {
    res.render('assistant/index', { orgName: req.params.orgName });
  });

router.post('/', isLoggedIn, async (req, res) => {
  const userInput = req.body.query;

  try {
    const context = await getRelevantContext(userInput, req.user.organization);

    const prompt = `
You are an assistant for SunTec. Use the context below to help the user accurately.

${context}

User Query: ${userInput}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({ response: response.choices[0].message.content });
  } catch (err) {
    console.error('Assistant error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

module.exports = router;

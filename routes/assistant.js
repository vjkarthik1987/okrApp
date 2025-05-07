const express = require('express');
const router = express.Router({ mergeParams: true });
const { isLoggedIn } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/checkRoles');
const getRelevantContext = require('../utils/getRelevantContext');
const { OpenAI } = require('openai');
const generateEmbedding = require('../utils/embedding');
const ContextFile = require('../models/ContextFile');
const cosineSimilarity = require('../utils/cosineSimilarity');
const QueryLog = require('../models/QueryLog'); 

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.get('/', isLoggedIn, async (req, res) => {
    res.render('assistant/index', { orgName: req.params.orgName });
  });

router.post('/', isLoggedIn, async (req, res) => {
  const query = req.body.query;

  try {
    const user = req.user;
    const queryEmbedding = await generateEmbedding(query);

    // Get all chunks from all context files
    const files = await ContextFile.find({ organization: user.organization }).lean();
    const allChunks = files.flatMap(file =>
      (file.chunks || []).map(chunk => ({
        text: chunk.text,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
      }))
    );
    

    // Sort by similarity and pick top N
    const topChunks = allChunks
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4); // You can adjust this

    const context = topChunks.map(chunk => chunk.text).join('\n\n');

    const prompt = `Use the following context to answer the question:\n\n${context}\n\nQuestion: ${query}`;

    // Send to OpenAI or your LLM
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant for a midsized enterprise.' },
        { role: 'user', content: prompt }
      ]
    });

    const responseText = completion.choices[0].message.content;
    await QueryLog.create({
      query,
      response: responseText,
      user: user._id,
      organization: user.organization,
      matchedChunks: topChunks.map(chunk => ({
        text: chunk.text,
        similarity: chunk.similarity
      }))
    });
    res.json({ response: responseText });
  } catch (err) {
    console.error(err);
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

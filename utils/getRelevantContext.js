const ContextFile = require('../models/ContextFile');
const generateEmbedding = require('./embedding');
const cosineSimilarity = require('./cosineSimilarity');

async function getRelevantContext(query, organizationId, topN = 3) {
  const queryEmbedding = await generateEmbedding(query);

  const files = await ContextFile.find({ organization: organizationId }).lean();
  const allChunks = [];

  for (const file of files) {
    for (const chunk of file.chunks || []) {
      allChunks.push({
        title: file.title,
        text: chunk.text,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding || [])
      });
    }
  }

  const topChunks = allChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);

  if (topChunks.length === 0) {
    return "❓ I couldn’t find anything relevant in your organizational documents.";
  }

  return topChunks.map(c => `📄 **${c.title}**\n${c.text}`).join('\n\n---\n\n');
}

module.exports = getRelevantContext;

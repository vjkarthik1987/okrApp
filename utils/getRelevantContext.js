const ContextFile = require('../models/ContextFile');
const generateEmbedding = require('./embedding');
const cosineSimilarity = require('./cosineSimilarity');

async function getRelevantContext(query, organizationId, topN = 3) {
  const queryEmbedding = await generateEmbedding(query);
  const contextFiles = await ContextFile.find({ organization: organizationId }).lean();

  const scored = contextFiles.map(file => ({
    title: file.title,
    content: file.content,
    similarity: cosineSimilarity(queryEmbedding, file.embedding || [])
  }));

  const topMatches = scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);

  return topMatches.map(f => `### ${f.title}\n${f.content}`).join('\n\n');
}

module.exports = getRelevantContext;

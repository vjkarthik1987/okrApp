// /ai/embeddingMatcher.js
const getEmbedding = require('../utils/getEmbedding');
const cosineSimilarity = require('../utils/cosineSimilarity');
const queryRegistry = require('./queryRegistry');

let phraseCache = [];

async function initEmbeddingCache() {
  if (phraseCache.length) return phraseCache;

  for (const entry of queryRegistry) {
    for (const phrase of entry.aiIntent) {
      const embedding = await getEmbedding(phrase);
      phraseCache.push({
        phrase,
        embedding,
        queryName: entry.name,
        type: entry.type
      });
    }
  }

  return phraseCache;
}

async function matchQueryByEmbedding(userQuery, typeHint = null) {
  const userEmbedding = await getEmbedding(userQuery);
  const cache = await initEmbeddingCache();

  let best = null;
  let bestScore = -1;

  for (const candidate of cache) {
    if (typeHint && candidate.type !== typeHint) continue;

    const score = cosineSimilarity(userEmbedding, candidate.embedding);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return {
    matchedQuery: best?.queryName,
    similarity: bestScore
  };
}

module.exports = { matchQueryByEmbedding };

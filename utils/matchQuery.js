const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const cosineSimilarity = require('./cosineSimilarity');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_FILE = path.join(__dirname, '../seeders/query_embeddings_openai.json');

let dataset = null;

// Load dataset once
function loadEmbeddings() {
  if (!dataset) {
    const raw = fs.readFileSync(EMBEDDING_FILE, 'utf-8');
    dataset = JSON.parse(raw);
  }
  return dataset;
}

// Embed user query
async function getEmbedding(query) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  });
  return response.data[0].embedding;
}

// Main matching function
async function matchQuery(userQuery, topK = 1) {
  const embedding = await getEmbedding(userQuery);
  const queries = loadEmbeddings();

  const results = queries.map(entry => ({
    ...entry,
    similarity: cosineSimilarity(embedding, entry.embedding)
  }));

  results.sort((a, b) => b.similarity - a.similarity);

  return topK === 1 ? results[0] : results.slice(0, topK);
}

module.exports = matchQuery;

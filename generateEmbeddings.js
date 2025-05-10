require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INPUT_FILE = './seeders/keyresult_queries.json';
const OUTPUT_FILE = './seeders/query_embeddings_openai.json';
const BATCH_SIZE = 100;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateEmbeddings() {
  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const output = [];

  console.log(`Starting embedding for ${rawData.length} queries...`);

  for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
    const batch = rawData.slice(i, i + BATCH_SIZE);
    const queries = batch.map(entry => entry.query);

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queries
      });

      for (let j = 0; j < response.data.length; j++) {
        output.push({
          query: batch[j].query,
          embedding: response.data[j].embedding,
          intent: batch[j].intent,
          mongoQuery: batch[j].mongoQuery,
          exampleResponse: batch[j].exampleResponse
        });
      }

      console.log(`✅ Processed batch ${i + 1} to ${i + BATCH_SIZE}`);
      await sleep(200); // prevent hitting rate limits

    } catch (err) {
      console.error(`❌ Error in batch ${i + 1}:`, err.message);
      break;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`🎉 Embeddings saved to ${OUTPUT_FILE}`);
}

generateEmbeddings();

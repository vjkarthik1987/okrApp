const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleExternalComparison(query) {
  const prompt = `
You are an AI assistant helping a company compare itself with the external world.

Given the user query, generate a thoughtful, 3-5 sentence response that begins with:
"Here's how your organization might compare..."

Avoid hallucinating specifics. If the query is vague, respond generically and cautiously.

Query: """${query}"""
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Respond with a thoughtful comparison based on the user’s tone and query.' },
        { role: 'user', content: prompt }
      ]
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('❌ handleExternalComparison failed:', err);
    return "⚠️ I couldn't generate a comparison at the moment. Please try again later.";
  }
}

module.exports = handleExternalComparison;

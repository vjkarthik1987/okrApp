// File: utils/detectIntentGPT.js
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function detectIntentGPT(query, userContext = {}) {
  const prompt = `
You are a backend query interpreter for an enterprise assistant.

Your job is to classify any user query into one of five categories, and return a structured JSON intent object that the backend can execute.

Respond ONLY with a valid JSON object. No markdown, no extra explanation.

---

🧠 Categories:

1. "internal" → questions about internal OKRs, action items, goals, diary logs, initiatives, etc.
2. "context" → questions about company policies, knowledge, or uploaded documentation.
3. "external" → questions comparing the organization to the outside world or industry.
4. "assistant" → queries about what the assistant can do or help with.
5. "combined" → queries that touch both internal data and contextual knowledge.

---

🎯 Intent Format by Category:

1. ✅ For "internal" queries:
{
  "category": "internal",
  "model": "KeyResult",          // Required: Objective, KeyResult, ActionItem, Initiative, DiaryEntry, TeamWeeklyUpdate
  "action": "summarize",         // Required: search | summarize | trend | create | compare | exception
  "subject": "my team",          // Optional: a user, a team, "me", "my team", etc.
  "filters": { "status": "on track" }, // Optional: semantic filters
  "dimension": "status",         // Optional: field to summarize or group by
  "timeframe": "this quarter",   // Optional: timeframe like "last week", "Q1-2024"
  "aggregation": "count",        // Optional: count, percent, average, total, etc.
  "notes": "short natural language explanation"
}

2. 🌐 For "external" queries:
{
  "category": "external",
  "topic": "how our talent strategy compares to industry",
  "notes": "User is asking for external benchmarking"
}

3. 📚 For "context" queries:
{
  "category": "context",
  "notes": "User is referring to internal documentation or concepts"
}

4. 🤖 For "assistant" queries:
{
  "category": "assistant",
  "notes": "User is asking about assistant’s capabilities"
}

5. 🔀 For "combined" queries:
Return the "internal" structure and mention in "notes" that it may also relate to internal documentation.

---

❌ Do NOT include raw Mongo field names like "assignedTo" or "ownerTeam".
✅ Use only semantic fields like "team", "user", "status", "timeframe", etc.
Let the backend resolve them.

Return a clean, minimal JSON object. No markdown or code blocks.

User query: """${query}"""
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a query-to-intent translator. Return only valid JSON as instructed.' },
        { role: 'user', content: prompt }
      ]
    });

    let raw = completion.choices[0].message.content.trim();

    // Strip markdown fencing if needed
    if (raw.startsWith('```json')) raw = raw.replace(/^```json/, '').replace(/```$/, '').trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```/, '').replace(/```$/, '').trim();

    const parsed = JSON.parse(raw);

    return {
      category: parsed.category || 'assistant',
      model: parsed.model || null,
      action: parsed.action || null,
      subject: parsed.subject || null,
      filters: parsed.filters || {},
      dimension: parsed.dimension || null,
      timeframe: parsed.timeframe || null,
      aggregation: parsed.aggregation || null,
      topic: parsed.topic || null,
      notes: parsed.notes || ''
    };
  } catch (err) {
    console.error('❌ detectIntentGPT failed:', err);
    return {
      category: 'assistant',
      model: null,
      action: null,
      subject: null,
      filters: {},
      dimension: null,
      timeframe: null,
      aggregation: null,
      topic: null,
      notes: 'Fallback due to error or bad output.'
    };
  }
}

module.exports = detectIntentGPT;

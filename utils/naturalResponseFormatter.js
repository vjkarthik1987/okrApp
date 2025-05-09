function aggregate(model, dimension, results) {
    if (!results || !results.length) return `No ${model}s found for that dimension.`;
  
    const lines = results.map(r => `• ${r._id || 'Unknown'}: ${r.count}`).join('\n');
    return `📊 **${model} breakdown by ${dimension}:**\n${lines}`;
  }
  
  function listResults(model, results) {
    const lines = results.map(r =>
      `• ${r.title || r.name || r._id}${r.status ? ` — ${r.status}` : ''}`
    ).join('\n');
  
    return `📦 Found ${results.length} ${model}(s):\n${lines}`;
  }
  
  module.exports = {
    aggregate,
    listResults
  };
  
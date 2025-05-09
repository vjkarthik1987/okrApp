// File: utils/fallbackHandler.js

function generateFallbackMessage(model, filters = {}) {
    let msg = `No ${model}s found`;
  
    const parts = [];
    if (filters.team) parts.push(`team: ${filters.team}`);
    if (filters.cycle) parts.push(`cycle: ${filters.cycle}`);
    if (filters.status) parts.push(`status: ${filters.status}`);
  
    if (parts.length) msg += ` for ${parts.join(', ')}`;
  
    return msg + `. You can try removing or adjusting some filters.`;
  }
  
  module.exports = { generateFallbackMessage };
  
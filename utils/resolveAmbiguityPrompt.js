function resolveAmbiguityPrompt(options, type) {
    if (!Array.isArray(options)) return '⚠️ I found multiple matches but couldn’t resolve them.';
  
    const list = options.map(o => `• ${o.name || o.title || o._id}`).join('\n');
    return `⚠️ I found multiple ${type === 'user' ? 'users' : 'records'}. Please clarify:\n\n${list}`;
  }
  
  module.exports = resolveAmbiguityPrompt;
  
const aliasMap = {
    'ceo': 'CEO’s Office',
    'epmo': 'EPMO',
    'peopl': 'People Team',
    'product mgmt': 'Product Management',
    'my team': 'my_team',
    'me': 'me',
    'myself': 'me'
  };
  
  function resolveAlias(input) {
    if (!input) return null;
    const normalized = input.trim().toLowerCase();
    return aliasMap[normalized] || input;
  }
  
  module.exports = {
    resolveAlias
  };
const Team = require('../models/Team');

const semanticMappings = {
  KeyResult: {
    team: ['ownerTeam', 'assignedTeams'],
    user: ['assignedTo'],
    status: {
      pending: ['Not Started', 'In Progress'],
      active: ['In Progress'],
      done: ['Completed'],
      blocked: ['Blocked', 'Deferred', 'On Hold']
    }
  },
  ActionItem: {
    team: ['assignedTo'],
    user: ['assignedTo'],
    status: {
      pending: ['Not Started', 'In Progress'],
      done: ['Completed'],
      blocked: ['Blocked', 'On Hold', 'Deferred']
    }
  },
  Objective: {
    team: ['teamId', 'assignedTeams'],
    user: ['createdBy'],
    status: {
      pending: ['Not Started', 'In Progress'],
      done: ['Completed']
    }
  }
};

async function resolveFilters(filters, modelName, user) {
  const resolved = {};
  const map = semanticMappings[modelName] || {};

  // 🚨 Warn if GPT returned raw fields instead of semantic keys
  for (const key of Object.keys(filters)) {
    if (!['team', 'user', 'status', 'cycle', 'year', 'week'].includes(key)) {
      console.warn(`⚠️ Unexpected raw field "${key}" received — ignoring it.`);
    }
  }

  for (const [key, value] of Object.entries(filters)) {
    const lowerValue = String(value).toLowerCase();
    const isSelf = ['me', 'myself', 'assigned to me'].includes(lowerValue);
    const isTeam = ['my team', 'our team'].includes(lowerValue);

    // 🧠 Handle team
    if (key === 'team' && map.team) {
      let teamId = isTeam ? user.team : null;

      if (!isTeam && typeof value === 'string') {
        const team = await Team.findOne({
          name: new RegExp(`^${value}$`, 'i'),
          organization: user.organization
        });
        if (team) teamId = team._id;
      }

      if (!teamId) {
        console.warn(`⚠️ Could not resolve team: ${value}`);
        continue;
      }

      resolved['$or'] = map.team.map(field =>
        field === 'assignedTeams' ? { [field]: { $in: [teamId] } } : { [field]: teamId }
      );
    }

    // 👤 Handle user
    else if (key === 'user' && map.user) {
      let userId = isSelf ? user._id : null;
    
      if (!isSelf && typeof value === 'string') {
        const User = require('../models/User');
        const matchedUser = await User.findOne({
          name: new RegExp(`^${value}$`, 'i'),
          organization: user.organization
        });
        if (matchedUser) userId = matchedUser._id;
      }
    
      if (!userId) {
        console.warn(`⚠️ Could not resolve user: ${value}`);
        continue;
      }
    
      if (map.user.length === 1) {
        resolved[map.user[0]] = userId;
      } else {
        resolved['$or'] = (resolved['$or'] || []).concat(
          map.user.map(f => ({ [f]: userId }))
        );
      }
    }
  
    // 📊 Handle status mapping
    else if (key === 'status' && map.status) {
      const matched = map.status[lowerValue] || [value];
      resolved['status'] = { $in: matched };
    }

    // 🔄 Allow passthrough of simple keys like "cycle", "year", "week"
    else if (['cycle', 'year', 'week'].includes(key)) {
      resolved[key] = value;
    }

    // ❌ Skip anything else
    else {
      console.warn(`⚠️ Unrecognized semantic key: ${key}`);
    }
  }

  return resolved;
}

module.exports = resolveFilters;

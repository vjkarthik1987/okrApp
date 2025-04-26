function buildTeamTree(teams) {
    const teamMap = new Map();
    const roots = [];
  
    // Step 1: map all teams by ID
    teams.forEach(team => teamMap.set(team._id.toString(), { ...team._doc, children: [] }));
  
    // Step 2: assign children to parents
    teamMap.forEach(team => {
      if (team.parentTeam) {
        const parent = teamMap.get(team.parentTeam.toString());
        if (parent) parent.children.push(team);
      } else {
        roots.push(team); // top-level teams
      }
    });
  
    return roots;
  }

module.exports = buildTeamTree;
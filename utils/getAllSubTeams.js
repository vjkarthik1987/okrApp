const Team = require('../models/Team');

async function getAllSubTeams(teamId) {
  let teams = [];
  const directSubteams = await Team.find({ parentTeam: teamId }).lean();

  for (const subteam of directSubteams) {
    teams.push(subteam);
    const subSubTeams = await getAllSubTeams(subteam._id);
    teams = teams.concat(subSubTeams);
  }

  return teams;
}

module.exports = getAllSubTeams;
const Team = require('../models/Team');
const getAllSubTeams = require('./getAllSubTeams');

async function getFunctionHeadAccessTeamIds(userId) {
    const ownedTeams = await Team.find({ functionHead: userId, activeTeam: true });

    let allTeamIds = [];

    for (let team of ownedTeams) {
        const subTeams = await getAllSubTeams(team._id); // Recursive
        allTeamIds.push(team._id);
        allTeamIds.push(...subTeams.map(t => t._id));
    }

    return allTeamIds;
}

module.exports = getFunctionHeadAccessTeamIds;

function canEditKR(user, kr, objective) {
    if (user.isSuperAdmin) return true;
  
    switch (kr.editableBy) {
      case 'ownerOnly':
        return kr.owner?.equals(user._id);
      case 'ownerTeam':
        return kr.ownerTeam?.equals(user.team);
      case 'objectiveTeam':
        return objective.teamId?.equals(user.team);
      case 'orgAdmins':
        return user.role === 'orgAdmin'; // if you define org admins
      default:
        return false;
    }
  }
  
  module.exports = { canEditKR };
  
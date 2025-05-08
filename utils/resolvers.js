const Team = require('../models/Team');
const User = require('../models/User');
const OKRCycle = require('../models/OKRCycle');
const WeekCycle = require('../models/WeekCycle');

async function resolveTeamId(subject, user) {
  if (!subject) return null;
  const lowered = subject.toLowerCase();
  if (['my team', 'our team'].includes(lowered)) return user.team;

  const match = await Team.findOne({
    name: new RegExp(subject, 'i'),
    organization: user.organization
  });
  return match?._id || null;
}

async function resolveUserId(subject, user) {
  if (!subject) return null;
  const lowered = subject.toLowerCase();
  if (['me', 'myself', 'i'].includes(lowered)) return user._id;

  const matches = await User.find({
    name: new RegExp(subject, 'i'),
    organization: user.organization
  });

  if (matches.length === 1) return matches[0]._id;
  if (matches.length > 1) return { ambiguous: true, options: matches.map(u => ({ id: u._id, name: u.name })) };
  return null;
}

async function resolveCycle(timeframe, orgId) {
  if (!timeframe) return null;
  const lowered = timeframe.toLowerCase();

  if (['this quarter', 'current quarter'].includes(lowered)) {
    return (await OKRCycle.findOne({ isEnabled: true, organization: orgId }))?.label || null;
  }

  return (await OKRCycle.findOne({
    label: new RegExp(timeframe, 'i'),
    organization: orgId
  }))?.label || null;
}

async function resolveWeekCycle(timeframe, orgId) {
  if (!timeframe) return null;
  const lowered = timeframe.toLowerCase();

  if (['this week', 'current week'].includes(lowered)) {
    return (await WeekCycle.findOne({ isActive: true, organization: orgId }))?._id || null;
  }

  return (await WeekCycle.findOne({
    label: new RegExp(timeframe, 'i'),
    organization: orgId
  }))?._id || null;
}

module.exports = {
  resolveTeamId,
  resolveUserId,
  resolveCycle,
  resolveWeekCycle
};

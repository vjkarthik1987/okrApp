// File: utils/expandSemanticFrame.js

const {
  resolveUserId,
  resolveTeamId,
  resolveCycle,
  resolveWeekCycle
} = require('./resolvers');

const {
  mapAliasesToFields,
  mapEnumValue
} = require('./aliasMapper');

const {
  validateRequiredFields,
  getMissingFields
} = require('./fieldValidator');

const { buildExceptionPipeline } = require('./exceptionUtils');
const { resolveAlias } = require('./aliasResolver');
const { resolveTimeframe } = require('./timeframeParser');
const schemaMetadata = require('./schemaMetadata.json');

function createFuzzyRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function expandSemanticFrame(intent, user) {
  const { action, model } = intent;
  const meta = schemaMetadata[model];
  if (!meta) return { error: `Model '${model}' not found.` };

  const filter = { organization: user.organization };
  const autofill = {};
  const updateFields = {};
  let dimension = intent.dimension || 'status';

  // Timeframe
  if (intent.timeframe) {
    const okrCycle = await resolveCycle(intent.timeframe, user.organization);
    const weekCycle = await resolveWeekCycle(intent.timeframe, user.organization);
    if (meta.fields.includes('cycle') && okrCycle) filter.cycle = okrCycle;
    if (meta.fields.includes('weekCycle') && weekCycle) filter.weekCycle = weekCycle;
  }

  // Subject (user or team)
  if (intent.subject) {
    const subjectList = Array.isArray(intent.subject) ? intent.subject : [intent.subject];

    for (const subject of subjectList) {
      const resolved = resolveAlias(subject);
      const teamId = await resolveTeamId(resolved, user);
      const userId = await resolveUserId(resolved, user);

      if (userId?.ambiguous) return { requiresClarification: true, options: userId.options, type: 'user' };

      if (model === 'KeyResult' || model === 'ActionItem') {
        if (userId) {
          filter.assignedTo = userId;
        } else if (teamId) {
          filter.$or = [
            { ownerTeam: teamId },
            { assignedTeams: { $in: [teamId] } }
          ];
        }
      }

      if (model === 'Objective' && teamId) {
        filter.$or = [
          { teamId },
          { assignedTeams: { $in: [teamId] } }
        ];
      }
    }
  }

  // Filters
  if (intent.filters) {
    for (const [key, value] of Object.entries(intent.filters)) {
      const mappedField = mapAliasesToFields(key, model);
      if (!mappedField) continue;
      const enumVal = mapEnumValue(value, model, mappedField[0]);
      filter[mappedField[0]] = enumVal || value;
    }
  }

  // Create
  if (action === 'create') {
    const createFields = validateRequiredFields(model, intent.fields || {}, user);
    const missingFields = getMissingFields(model, createFields, meta.fields);
    if (missingFields.length > 0) {
      return {
        model,
        action,
        createFields,
        missingFields,
        prompt: `Missing: ${missingFields.join(', ')}`
      };
    }
    return { model, action, createFields };
  }

  // Update
  if (action === 'update') {
    if (!intent.filters || !intent.updateFields) {
      return { error: 'Update requires filters and updateFields.' };
    }
    const titleRegex = intent.filters.title ? createFuzzyRegex(intent.filters.title) : null;
    if (titleRegex) filter.title = titleRegex;

    for (const [key, value] of Object.entries(intent.updateFields)) {
      const mapped = mapAliasesToFields(key, model);
      if (mapped) {
        const enumVal = mapEnumValue(value, model, mapped[0]);
        updateFields[mapped[0]] = enumVal || value;
      }
    }
    return { model, action, filter, updateFields };
  }

  // Exception
  if (action === 'exception') {
    const pipeline = await buildExceptionPipeline(model, filter, user.organization);
    return { model, action, pipeline, dimension: 'exceptionReason' };
  }

  // Summarize / Trend
  if (['summarize', 'trend'].includes(action)) {
    const dimField = mapAliasesToFields(dimension, model)?.[0] || dimension;
    const pipeline = [
      { $match: filter },
      { $group: { _id: `$${dimField}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ];
    return { model, action, pipeline, dimension: dimField };
  }

  return { model, action: 'search', filter, timeframe: intent.timeframe };
}

module.exports = expandSemanticFrame;
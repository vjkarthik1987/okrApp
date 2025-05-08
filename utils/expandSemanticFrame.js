const { resolveUserId, resolveTeamId, resolveCycle, resolveWeekCycle } = require('./resolvers');
const { mapAliasesToFields, mapEnumValue } = require('./aliasMapper');
const { validateRequiredFields, getMissingFields } = require('./fieldValidator');
const schemaMetadata = require('./schemaMetadata.json');

// Utility to determine if a value looks like an ObjectId
const isObjectId = val => typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val);

// Handles fuzzy match logic
function createFuzzyRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function expandSemanticFrame(intent, user) {
  const { action, model } = intent;
  const meta = schemaMetadata[model];
  if (!meta) {
    return { error: `Model '${model}' not recognized.` };
  }

  const filter = { organization: user.organization };
  const autofill = {};
  const updateFields = {};
  const errors = [];
  const matchPreview = [];

  // Timeframe resolution
  if (intent.timeframe) {
    const cycle = await resolveCycle(intent.timeframe, user.organization);
    const weekCycle = await resolveWeekCycle(intent.timeframe, user.organization);
    if (meta.fields.includes('cycle') && cycle) filter.cycle = cycle;
    if (meta.fields.includes('weekCycle') && weekCycle) filter.weekCycle = weekCycle;
  }

  // Subject resolution
  if (intent.subject) {
    const subjectList = Array.isArray(intent.subject) ? intent.subject : [intent.subject];

    for (const subject of subjectList) {
      const teamId = await resolveTeamId(subject, user);
      const userId = await resolveUserId(subject, user);

      if (meta.fields.includes('assignedTo') && userId) {
        filter.assignedTo = userId;
      } else if (meta.fields.includes('teamId') && teamId) {
        filter.$or = [
          { teamId },
          { assignedTeams: { $in: [teamId] } },
          { ownerTeam: teamId }
        ];
      }
    }
  }

  // Enum & alias resolution (e.g., status = at risk)
  if (intent.filters) {
    for (const [key, value] of Object.entries(intent.filters)) {
      const field = mapAliasesToFields(key, model);
      if (!field) continue;

      const schemaField = field[0];
      const enumValue = mapEnumValue(value, model, schemaField);
      if (enumValue) {
        filter[schemaField] = enumValue;
      } else {
        filter[schemaField] = value;
      }
    }
  }

  // Handle actions
  if (action === 'search') {
    return { model, action, filter };
  }

  if (action === 'create') {
    const required = validateRequiredFields(model, intent.fields || {}, user);
    const missing = getMissingFields(model, required, meta.fields);

    const finalFields = {
      ...required,
      organization: user.organization,
      createdBy: user._id,
    };

    if (missing.length > 0) {
      return {
        model,
        action,
        createFields: finalFields,
        missingFields: missing,
        prompt: `Missing required fields: ${missing.join(', ')}.`
      };
    }

    return {
      model,
      action,
      createFields: finalFields
    };
  }

  if (action === 'update') {
    if (!intent.filters || !intent.updateFields) {
      return { error: 'Update requires both filters and updateFields.' };
    }

    // Prepare filter for update
    const titleFilter = intent.filters.title ? createFuzzyRegex(intent.filters.title) : null;
    if (titleFilter) filter.title = titleFilter;

    // Prepare update fields (with enum normalization)
    for (const [key, value] of Object.entries(intent.updateFields)) {
      const fieldMatch = mapAliasesToFields(key, model);
      if (fieldMatch) {
        const fieldName = fieldMatch[0];
        const enumValue = mapEnumValue(value, model, fieldName);
        updateFields[fieldName] = enumValue || value;
      }
    }

    return {
      model,
      action,
      filter,
      updateFields,
      autofill,
      matchPreview
    };
  }

  // Summarize / Trend / Exception
  if (['summarize', 'trend', 'exception'].includes(action)) {
    const dimension = intent.dimension || 'status';
    const dimField = mapAliasesToFields(dimension, model)?.[0] || dimension;

    const pipeline = [
      { $match: filter },
      {
        $group: {
          _id: `$${dimField}`,
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ];

    return {
      model,
      action,
      pipeline,
      dimension: dimField
    };
  }

  return { model, action, filter };
}

module.exports = expandSemanticFrame;

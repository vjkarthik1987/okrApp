const schemaMetadata = require('./schemaMetadata.json');

function mapAliasesToFields(key, model) {
  const modelAliases = schemaMetadata.aliases?.[model] || {};
  const fallback = schemaMetadata.aliases?.['KeyResult'] || {}; // fallback to catch common keys
  return modelAliases[key.toLowerCase()] || fallback[key.toLowerCase()] || null;
}

function mapEnumValue(value, model, field) {
  const enums = schemaMetadata?.[model]?.enums?.[field];
  if (!enums) return null;

  const lowered = value.toLowerCase();
  for (const option of enums) {
    if (option.toLowerCase() === lowered) return option;
  }
  return null;
}

module.exports = {
  mapAliasesToFields,
  mapEnumValue
};

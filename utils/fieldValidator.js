const schemaMetadata = require('./schemaMetadata.json');

function validateRequiredFields(model, fields = {}, user) {
  const output = { ...fields };
  if (!output.organization && user.organization) output.organization = user.organization;
  if (!output.createdBy && user._id) output.createdBy = user._id;
  return output;
}

function getMissingFields(model, fields = {}, allowedFields = []) {
  const required = ['title'];
  return required.filter(f => !fields[f] && allowedFields.includes(f));
}

module.exports = {
  validateRequiredFields,
  getMissingFields
};

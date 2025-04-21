const Organization = require('../models/Organization');

async function loadOrg(req, res, next) {
  const orgName = req.params.orgName;
  if (!orgName) return res.status(400).json({ error: 'Organization not specified' });

  const organization = await Organization.findOne({ orgName });
  if (!organization) return res.status(404).json({ error: 'Organization not found' });

  req.organization = organization; // attach to request object
  next();
}

module.exports = loadOrg;
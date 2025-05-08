// 📁 scripts/extractSchemaMetadata.js

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const models = {
  Objective: require('../models/Objective'),
  KeyResult: require('../models/KeyResult'),
  ActionItem: require('../models/ActionItem'),
  DiaryEntry: require('../models/DiaryEntry'),
  Initiative: require('../models/Initiative'),
  TeamWeeklyUpdate: require('../models/TeamWeeklyUpdate'),
  User: require('../models/User'),
  Team: require('../models/Team'),
  OKRCycle: require('../models/OKRCycle'),
  WeekCycle: require('../models/WeekCycle'),
  ContextFile: require('../models/ContextFile'),
  QueryLog: require('../models/QueryLog')
};

const metadata = {};

for (const [modelName, model] of Object.entries(models)) {
  const schemaPaths = model.schema.paths;
  const fields = [];
  const enums = {};

  for (const [key, value] of Object.entries(schemaPaths)) {
    if (key === '__v') continue;
    fields.push(key);

    if (value.options?.enum) {
      enums[key] = value.options.enum;
    }
  }

  metadata[modelName] = {
    fields,
    enums,
    aliases: {}
  };
}

const outputPath = path.join(__dirname, '../utils/schemaMetadata.json');
fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));
console.log(`✅ Extracted schema metadata to ${outputPath}`);
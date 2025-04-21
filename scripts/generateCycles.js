const mongoose = require('mongoose');
const Cycle = require('../models/Cycle');
const Organization = require('../models/Organization'); // if needed

mongoose.connect('mongodb://localhost:27017/okrApp');

const orgId = 'YOUR_ORG_ID_HERE'; // replace or dynamically fetch

async function generateFutureCycles(startYear = 2025, yearsToGenerate = 5) {
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  for (let year = startYear; year < startYear + yearsToGenerate; year++) {
    for (const q of quarters) {
      const cycleCode = `${q}-${year}`;
      const exists = await Cycle.findOne({ cycleCode, organization: orgId });
      if (!exists) {
        await new Cycle({
          cycleCode,
          year,
          quarter: q,
          isEnabled: false,
          organization: orgId
        }).save();
        console.log(`Created cycle: ${cycleCode}`);
      }
    }
  }
  mongoose.connection.close();
}

generateFutureCycles();

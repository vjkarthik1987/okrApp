const mongoose = require('mongoose');
const User = require('./models/User'); // Adjust path if needed
const Organization = require('./models/Organization');
const WeekCycle = require('./models/WeekCycle');
const MONGO_URI = 'mongodb://localhost:27017/okrApp';


// Replace this with your MongoDB connection string
// const MONGODB_URI = 'mongodb://localhost:27017/okrApp'; // 👈 Update if needed

// //Remove all users except the one with the specified name
// async function cleanUsers() {
//   try {
//     await mongoose.connect(MONGODB_URI, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true
//     });
//     console.log('MongoDB connected.');

//     const result = await User.deleteMany({
//       email: { $ne: 'karthikvj@suntecgroup.com' }
//     });

//     console.log(`✅ Deleted ${result.deletedCount} user(s).`);

//     await mongoose.disconnect();
//     console.log('MongoDB disconnected.');
    
//   } catch (err) {
//     console.error('❌ Error deleting users:', err);
//   }
// }

// async function updateNumberOfReportees() {
//   try {
//     await mongoose.connect(MONGODB_URI);
//     console.log('Connected to database');

//     const users = await User.find({});
//     console.log(`Found ${users.length} users.`);

//     for (const user of users) {
//       const count = await User.countDocuments({ manager: user._id });
//       user.numberOfReportees = count;
//       await user.save();
//       console.log(`Updated ${user.name} (${user.email}) → Reportees: ${count}`);
//     }

//     console.log('✅ All users updated successfully.');
//     process.exit(0); // Exit cleanly

//   } catch (error) {
//     console.error('❌ Error updating numberOfReportees:', error);
//     process.exit(1); // Exit with error
//   }
// }
// const Objective = require('./models/Objective');

// async function updateAssignedTeams() {
//   await mongoose.connect('mongodb://localhost:27017/okrApp'); // adjust URI

//   const updated = await Objective.findByIdAndUpdate(
//     '681097b379e8a292f5002fbf',
//     {
//       assignedTeams: [
//         new mongoose.Types.ObjectId('680bc73dd0ac86239597df60'),
//         new mongoose.Types.ObjectId('680bcf934d8f0b5c83c8352d')
//       ]
//     },
//     { new: true }
//   );

//   console.log('Updated Objective:', updated);
//   mongoose.disconnect();
// }

//updateAssignedTeams();
//cleanUsers();
//updateNumberOfReportees();

const Team = require('./models/Team'); // Adjust path as needed
require('dotenv').config(); // If you're using .env for DB connection

//const MONGO_URI = 'mongodb://localhost:27017/okrApp';

async function buildTeamHierarchy(allTeams, parentId = null) {
  const children = allTeams.filter(team => {
    return (team.parentTeam ? team.parentTeam.toString() : null) === (parentId ? parentId.toString() : null);
  });

  const result = await Promise.all(children.map(async team => {
    const subTeams = await buildTeamHierarchy(allTeams, team._id);
    return {
      _id: team._id,
      name: team.name,
      functionHead: team.functionHead,
      okrEditors: team.okrEditors,
      subTeams: subTeams
    };
  }));

  return result;
}

async function exportHierarchy() {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

    const allTeams = await Team.find({ activeTeam: true }).lean();
    const hierarchy = await buildTeamHierarchy(allTeams);

    const fs = require('fs');
    fs.writeFileSync('orgHierarchy.json', JSON.stringify(hierarchy, null, 2));
    console.log('✅ Organization hierarchy saved to orgHierarchy.json');
  } catch (err) {
    console.error('❌ Error exporting hierarchy:', err);
  } finally {
    mongoose.connection.close();
  }
}

exportHierarchy();


// async function addOrgIdToWeekCycles() {
//   try {
//     await mongoose.connect(MONGO_URI, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true
//     });

//     const org = await Organization.findOne({ orgName: 'suntecgroup' }); // Replace with actual org name
//     if (!org) {
//       console.log('❌ Organization not found');
//       return;
//     }

//     const result = await WeekCycle.updateMany(
//       { organization: { $exists: false } },
//       { $set: { organization: org._id } }
//     );

//     console.log(`✅ Updated ${result.modifiedCount} WeekCycle(s) with organization ID.`);
//     mongoose.connection.close();
//   } catch (err) {
//     console.error('❌ Error during backfill:', err);
//     mongoose.connection.close();
//   }
// }

// addOrgIdToWeekCycles();


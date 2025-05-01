const mongoose = require('mongoose');
const User = require('./models/User'); // Adjust path if needed

// Replace this with your MongoDB connection string
const MONGODB_URI = 'mongodb://localhost:27017/okrApp'; // 👈 Update if needed

//Remove all users except the one with the specified name
async function cleanUsers() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected.');

    const result = await User.deleteMany({
      email: { $ne: 'karthikvj@suntecgroup.com' }
    });

    console.log(`✅ Deleted ${result.deletedCount} user(s).`);

    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
    
  } catch (err) {
    console.error('❌ Error deleting users:', err);
  }
}

async function updateNumberOfReportees() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to database');

    const users = await User.find({});
    console.log(`Found ${users.length} users.`);

    for (const user of users) {
      const count = await User.countDocuments({ manager: user._id });
      user.numberOfReportees = count;
      await user.save();
      console.log(`Updated ${user.name} (${user.email}) → Reportees: ${count}`);
    }

    console.log('✅ All users updated successfully.');
    process.exit(0); // Exit cleanly

  } catch (error) {
    console.error('❌ Error updating numberOfReportees:', error);
    process.exit(1); // Exit with error
  }
}
const Objective = require('./models/Objective');

async function updateAssignedTeams() {
  await mongoose.connect('mongodb://localhost:27017/okrApp'); // adjust URI

  const updated = await Objective.findByIdAndUpdate(
    '681097b379e8a292f5002fbf',
    {
      assignedTeams: [
        new mongoose.Types.ObjectId('680bc73dd0ac86239597df60'),
        new mongoose.Types.ObjectId('680bcf934d8f0b5c83c8352d')
      ]
    },
    { new: true }
  );

  console.log('Updated Objective:', updated);
  mongoose.disconnect();
}

updateAssignedTeams();

//cleanUsers();
//updateNumberOfReportees();

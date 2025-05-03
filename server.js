require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const loadOrg = require('./middleware/loadOrg');
const path = require('path');
const engine = require('ejs-mate');
const methodOverride = require('method-override');
const User = require('./models/User');

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', engine); // 👈 use ejs-mate
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', false);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI);

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'okrApp',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));



// Passport setup
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

app.use(async (req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  res.locals.request = req;
  if (req.user) {
    res.locals.hasReportees = req.user.numberOfReportees > 0;
  } else {
    res.locals.hasReportees = false;
  }
  next();
});

// Auth and OKR routes with orgName prefix
app.use('/register-org', require('./routes/registerOrg'));
app.use('/:orgName/auth', loadOrg, require('./routes/auth'));
app.use('/:orgName/okrs', loadOrg, require('./routes/okrs'));
app.use('/:orgName/users', loadOrg, require('./routes/users'));
app.use('/:orgName/teams', loadOrg, require('./routes/teams'));
app.use('/:orgName/objectives', loadOrg, require('./routes/objectives'));
app.use('/:orgName/dashboard', loadOrg, require('./routes/dashboard'));
app.use('/:orgName/actionItems', loadOrg, require('./routes/actionItems'));
app.use('/:orgName/initiatives', loadOrg, require('./routes/initiatives'));
app.use('/:orgName/admin/cycles', loadOrg, require('./routes/cycles'));
app.use('/:orgName/admin/weekcycles', loadOrg, require('./routes/weekcycles'));
app.use('/:orgName/diary', loadOrg, require('./routes/diary'));
app.use('/:orgName/manager-dashboard', loadOrg, require('./routes/managerDashboard'));
app.use('/:orgName/superAdmins', loadOrg, require('./routes/superAdmins'));
app.use('/:orgName/myKeyResults', loadOrg, require('./routes/myKeyResults'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}\n----------------------------------------------------------`));

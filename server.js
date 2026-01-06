const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Adjust for development
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aarogyadarpan', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB Connected');
  // Start reminder scheduler
  require('./utils/reminderScheduler');
})
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patient', require('./routes/patient'));
app.use('/api/hospital', require('./routes/hospital'));
app.use('/api/lab', require('./routes/lab'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/chatbot', require('./routes/chatbot'));

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/patient', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'patient', 'login.html'));
});

app.get('/hospital', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hospital', 'login.html'));
});

app.get('/lab', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lab', 'login.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


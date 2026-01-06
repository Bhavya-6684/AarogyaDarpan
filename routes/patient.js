const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Prescription = require('../models/Prescription');
const MedicalReport = require('../models/MedicalReport');
const MedicineReminder = require('../models/MedicineReminder');
const FamilyMember = require('../models/FamilyMember');
const Notification = require('../models/Notification');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Profile photo upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.user._id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const patientId = req.user._id;
    const { familyMemberId } = req.query;
    const queryPatientId = familyMemberId ? familyMemberId : patientId;
    const isFamilyMember = !!familyMemberId;

    // Get upcoming reminders
    const reminders = await MedicineReminder.find({
      [isFamilyMember ? 'familyMemberId' : 'patientId']: queryPatientId,
      isActive: true,
      completed: false,
      endDate: { $gte: new Date() }
    })
    .sort({ reminderTime: 1 })
    .populate('prescriptionId', 'doctorName hospitalName date')
    .limit(10);

    // Get recent prescriptions
    // For patient, also include prescriptions by phone number (for prescriptions created before registration)
    let prescriptionQuery;
    if (isFamilyMember) {
      prescriptionQuery = { 
        familyMemberId: queryPatientId,
        patientId: patientId,
        isEmergencyPatient: false
      };
    } else {
      prescriptionQuery = { 
        $or: [
          { patientId: patientId, isEmergencyPatient: false },
          { patientPhone: req.user.phone, patientId: null, isEmergencyPatient: false }
        ],
        familyMemberId: null
      };
    }
    const prescriptions = await Prescription.find(prescriptionQuery)
    .sort({ date: -1 })
    .limit(10);

    // Get recent reports
    let reportQuery;
    if (isFamilyMember) {
      reportQuery = { 
        familyMemberId: queryPatientId,
        patientId: patientId,
        isEmergencyPatient: false
      };
    } else {
      reportQuery = { 
        $or: [
          { patientId: patientId, isEmergencyPatient: false },
          { patientPhone: req.user.phone, patientId: null, isEmergencyPatient: false }
        ],
        familyMemberId: null
      };
    }
    const reports = await MedicalReport.find(reportQuery)
    .sort({ date: -1 })
    .limit(10);

    // Get notifications
    const notifications = await Notification.find({
      userId: patientId,
      isRead: false
    })
    .sort({ createdAt: -1 })
    .limit(10);

    res.json({
      reminders,
      prescriptions,
      reports,
      notifications
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get prescriptions
router.get('/prescriptions', async (req, res) => {
  try {
    const { familyMemberId } = req.query;
    
    // Build query based on whether viewing for family member or self
    let query;
    if (familyMemberId) {
      // Viewing for a family member - must match both familyMemberId and patientId (owner)
      query = { 
        familyMemberId: familyMemberId,
        patientId: req.user._id,
        isEmergencyPatient: false // Exclude emergency patients
      };
    } else {
      // Viewing for self - match by patientId OR phone number (for prescriptions created before registration)
      query = { 
        $or: [
          { patientId: req.user._id, isEmergencyPatient: false },
          { patientPhone: req.user.phone, patientId: null, isEmergencyPatient: false }
        ],
        familyMemberId: null // Only show prescriptions for the main account, not family members
      };
    }

    const prescriptions = await Prescription.find(query)
      .sort({ date: -1 });
    
    // Update prescriptions without patientId to link them (only for main account)
    if (!familyMemberId) {
      await Prescription.updateMany(
        { patientPhone: req.user.phone, patientId: null, isEmergencyPatient: false },
        { $set: { patientId: req.user._id } }
      );
    }
    
    res.json({ prescriptions });
  } catch (error) {
    console.error('Get prescriptions error:', error);
    res.status(500).json({ 
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get medical reports (includes reports from both hospitals and labs)
router.get('/reports', async (req, res) => {
  try {
    const { familyMemberId } = req.query;
    
    // Build query based on whether viewing for family member or self
    let query;
    if (familyMemberId) {
      // Viewing for a family member - must match both familyMemberId and patientId (owner)
      query = { 
        familyMemberId: familyMemberId,
        patientId: req.user._id,
        isEmergencyPatient: false // Exclude emergency patients
      };
    } else {
      // Viewing for self - match by patientId OR phone number (for reports created before registration)
      query = { 
        $or: [
          { patientId: req.user._id, isEmergencyPatient: false },
          { patientPhone: req.user.phone, patientId: null, isEmergencyPatient: false }
        ],
        familyMemberId: null // Only show reports for the main account, not family members
      };
    }

    const reports = await MedicalReport.find(query)
      .sort({ date: -1 });
    
    // Update reports without patientId to link them (only for main account)
    if (!familyMemberId) {
      await MedicalReport.updateMany(
        { patientPhone: req.user.phone, patientId: null, isEmergencyPatient: false },
        { $set: { patientId: req.user._id } }
      );
    }
    
    res.json({ reports });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ 
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Download report
router.get('/reports/:id/download', async (req, res) => {
  try {
    const report = await MedicalReport.findOne({
      _id: req.params.id,
      patientId: req.user._id
    });

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const filePath = path.join(__dirname, '..', report.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.download(filePath, report.fileName);
  } catch (error) {
    console.error('Download report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get reminders
router.get('/reminders', async (req, res) => {
  try {
    const { familyMemberId } = req.query;
    const query = familyMemberId 
      ? { familyMemberId, patientId: req.user._id }
      : { patientId: req.user._id };

    const reminders = await MedicineReminder.find(query)
      .populate('prescriptionId')
      .sort({ reminderTime: 1 });
    
    res.json({ reminders });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get family members
router.get('/family-members', async (req, res) => {
  try {
    const members = await FamilyMember.find({ patientId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.json({ members });
  } catch (error) {
    console.error('Get family members error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add family member
router.post('/family-members', [
  body('name').notEmpty().withMessage('Name is required'),
  body('age').isInt({ min: 1, max: 150 }).withMessage('Valid age is required'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('Valid gender is required'),
  body('relationship').notEmpty().withMessage('Relationship is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, age, gender, relationship } = req.body;

    const member = new FamilyMember({
      patientId: req.user._id,
      name,
      age,
      gender,
      relationship
    });

    await member.save();
    res.json({ message: 'Family member added successfully', member });
  } catch (error) {
    console.error('Add family member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile
router.put('/profile', [
  body('name').optional().notEmpty().withMessage('Name cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    await user.save();

    res.json({ 
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload profile photo
router.post('/profile/photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    // Delete old photo if exists
    if (user.profilePhoto) {
      const oldPath = path.join(__dirname, '..', user.profilePhoto);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    user.profilePhoto = `uploads/profiles/${req.file.filename}`;
    await user.save();

    res.json({ 
      message: 'Profile photo updated successfully',
      profilePhoto: user.profilePhoto
    });
  } catch (error) {
    console.error('Upload profile photo error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change password
router.put('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get notifications
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Handle consent request
router.post('/consent/:consentId/respond', [
  body('action').isIn(['grant', 'deny']).withMessage('Action must be grant or deny')
], async (req, res) => {
  try {
    const Consent = require('../models/Consent');
    const { action } = req.body;

    const consent = await Consent.findOne({
      _id: req.params.consentId,
      patientId: req.user._id
    });

    if (!consent) {
      return res.status(404).json({ message: 'Consent request not found' });
    }

    consent.status = action === 'grant' ? 'granted' : 'denied';
    consent.respondedAt = new Date();
    await consent.save();

    // Create notification for hospital
    await Notification.create({
      userId: consent.hospitalId,
      type: 'consent_request',
      title: `Consent ${action === 'grant' ? 'Granted' : 'Denied'}`,
      message: `Patient ${req.user.name} has ${action === 'grant' ? 'granted' : 'denied'} access request`,
      relatedId: consent._id
    });

    res.json({ message: `Consent ${action === 'grant' ? 'granted' : 'denied'} successfully` });
  } catch (error) {
    console.error('Respond to consent error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


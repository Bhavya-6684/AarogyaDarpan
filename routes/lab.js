const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const MedicalReport = require('../models/MedicalReport');
const User = require('../models/User');
const Notification = require('../models/Notification');
const upload = require('../middleware/upload');

const router = express.Router();

// All routes require lab authentication
router.use(auth);
router.use(authorize('lab'));

// Get dashboard (all uploaded reports)
router.get('/dashboard', async (req, res) => {
  try {
    const reports = await MedicalReport.find({ labId: req.user._id })
      .sort({ date: -1 })
      .limit(50);
    
    res.json({ reports });
  } catch (error) {
    console.error('Lab dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload medical report
router.post('/reports', upload.single('report'), [
  body('hospitalName').notEmpty().withMessage('Hospital name is required'),
  body('patientPhone').isMobilePhone('any', { strictMode: false }).withMessage('Valid phone number required (e.g., +91XXXXXXXXXX)'),
  body('patientName').notEmpty().withMessage('Patient name is required'),
  body('reportType').notEmpty().withMessage('Report type is required'),
  body('reportName').notEmpty().withMessage('Report name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(e => e.msg).join(', ');
      return res.status(400).json({ message: errorMessages, errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Report file is required' });
    }

    const { hospitalName, patientPhone, patientName, reportType, reportName, description } = req.body;

    // Find patient by phone AND name (matching logic)
    let patient = await User.findOne({ 
      phone: patientPhone.trim(), 
      role: 'patient',
      name: { $regex: new RegExp(patientName.trim(), 'i') } // Case-insensitive name matching
    });
    
    // If exact match not found, try phone only
    if (!patient) {
      patient = await User.findOne({ phone: patientPhone.trim(), role: 'patient' });
    }

    // Find hospital by name (case-insensitive)
    const hospital = await User.findOne({
      role: { $in: ['hospital', 'doctor'] },
      $or: [
        { hospitalName: { $regex: new RegExp(hospitalName.trim(), 'i') } },
        { name: { $regex: new RegExp(hospitalName.trim(), 'i') } }
      ]
    });

    const report = new MedicalReport({
      patientPhone,
      patientName,
      patientId: patient ? patient._id : null,
      labId: req.user._id,
      labName: req.user.name,
      hospitalId: hospital ? hospital._id : null,
      hospitalName: hospitalName.trim(),
      uploadedBy: 'lab',
      reportType,
      reportName,
      filePath: `uploads/reports/${req.file.filename}`,
      fileName: req.file.originalname,
      description: description || '',
      isEmergencyPatient: false
    });

    await report.save();

    // Create notification for patient if exists
    if (patient) {
      await Notification.create({
        userId: patient._id,
        type: 'report',
        title: 'New Medical Report',
        message: `New ${reportType} report uploaded by ${req.user.name}`,
        relatedId: report._id
      });
    }

    res.json({ 
      message: 'Report uploaded successfully',
      report 
    });
  } catch (error) {
    console.error('Upload report error:', error);
    res.status(500).json({ 
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get reports by type
router.get('/reports', async (req, res) => {
  try {
    const { reportType } = req.query;
    const query = { labId: req.user._id };
    
    if (reportType) {
      query.reportType = reportType;
    }

    const reports = await MedicalReport.find(query)
      .sort({ date: -1 });
    
    res.json({ reports });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Prescription = require('../models/Prescription');
const MedicalReport = require('../models/MedicalReport');
const MedicineReminder = require('../models/MedicineReminder');
const Consent = require('../models/Consent');
const Admission = require('../models/Admission');
const EmergencyPatient = require('../models/EmergencyPatient');
const Notification = require('../models/Notification');
const User = require('../models/User');
const upload = require('../middleware/upload');
const path = require('path');

const router = express.Router();

// All routes require hospital authentication
router.use(auth);
router.use(authorize('hospital'));

// Get dashboard data (privacy-safe - no patient personal info)
router.get('/dashboard', async (req, res) => {
  try {
    // Get prescriptions created today (count only)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const prescriptionsTodayCount = await Prescription.countDocuments({
      hospitalId: req.user._id,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    // Get admitted patients (privacy-safe - exclude patient info)
    const admittedPatients = await Admission.find({
      hospitalId: req.user._id,
      isActive: true
    })
      .sort({ admissionDate: -1 })
      .select('-patientName -patientPhone -patientId');

    // Get pending consent requests (these show patient info as they're requests)
    const pendingConsents = await Consent.find({
      hospitalId: req.user._id,
      status: 'pending'
    })
      .sort({ requestedAt: -1 });

    // Get emergency patients
    const emergencyPatients = await EmergencyPatient.find({
      hospitalId: req.user._id,
      isActive: true
    })
      .sort({ admissionDate: -1 })
      .limit(5);

    res.json({
      prescriptionsTodayCount, // Count of prescriptions created today
      admittedPatients,
      emergencyPatients,
      pendingConsents
    });
  } catch (error) {
    console.error('Hospital dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create prescription (supports both regular and emergency patients)
router.post('/prescriptions', [
  body('patientPhone').optional().isMobilePhone('any', { strictMode: false }).withMessage('Valid phone number required (e.g., +91XXXXXXXXXX)'),
  body('patientName').optional().notEmpty().withMessage('Patient name is required for regular patients'),
  body('emergencyPatientId').optional().isMongoId().withMessage('Valid emergency patient ID required'),
  body('medicines').isArray({ min: 1 }).withMessage('At least one medicine is required'),
  body('medicines.*.name').notEmpty().withMessage('Medicine name is required'),
  body('medicines.*.dosage').notEmpty().withMessage('Medicine dosage is required'),
  body('medicines.*.timing').optional().notEmpty().withMessage('Medicine timing (optional - AI will assign defaults)'),
  body('medicines.*.duration').isInt({ min: 1 }).withMessage('Valid duration in days is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { patientPhone, patientName, medicines, notes, familyMemberId, emergencyPatientId } = req.body;

    let patient = null;
    let isEmergency = false;
    let prescriptionData = {
      doctorName: req.user.name,
      hospitalName: req.user.hospitalName || req.user.name,
      hospitalId: req.user._id,
      medicines,
      notes: notes || ''
    };

    // Handle emergency patient
    if (emergencyPatientId) {
      const emergencyPatient = await EmergencyPatient.findOne({
        _id: emergencyPatientId,
        hospitalId: req.user._id,
        isActive: true
      });

      if (!emergencyPatient) {
        return res.status(404).json({ message: 'Emergency patient not found or discharged' });
      }

      isEmergency = true;
      prescriptionData.patientPhone = `EMG-${emergencyPatient.temporaryId}`;
      prescriptionData.patientName = `Emergency Patient - Bed ${emergencyPatient.bedNumber}`;
      prescriptionData.emergencyPatientId = emergencyPatient._id;
      prescriptionData.isEmergencyPatient = true;
      prescriptionData.patientId = null;
      prescriptionData.familyMemberId = null;
    } else {
      // Regular patient - phone and name required
      if (!patientPhone || !patientName) {
        return res.status(400).json({ message: 'Patient phone and name are required for regular patients' });
      }

      // Find patient by phone
      patient = await User.findOne({ phone: patientPhone, role: 'patient' });

      prescriptionData.patientPhone = patientPhone;
      prescriptionData.patientName = patientName;
      prescriptionData.patientId = patient ? patient._id : null;
      prescriptionData.familyMemberId = familyMemberId || null;
      prescriptionData.isEmergencyPatient = false;
    }

    const prescription = new Prescription(prescriptionData);
    await prescription.save();

    // Create medicine reminders if patient exists (not for emergency patients)
    if (patient && !isEmergency) {
      await createMedicineReminders(patient._id, familyMemberId, prescription);
    }

    // Create notification for patient if exists (not for emergency patients)
    if (patient && !isEmergency) {
      await Notification.create({
        userId: patient._id,
        type: 'prescription',
        title: 'New Prescription',
        message: `New prescription from ${req.user.hospitalName || req.user.name}`,
        relatedId: prescription._id
      });
    }

    res.json({ 
      message: 'Prescription created successfully',
      prescription 
    });
  } catch (error) {
    console.error('Create prescription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to create medicine reminders
async function createMedicineReminders(patientId, familyMemberId, prescription) {
  const reminders = [];

  for (const medicine of prescription.medicines) {
    // Parse timing to create reminders
    const timingSlots = parseTiming(medicine.timing);
    
    for (const timeSlot of timingSlots) {
      const startDate = new Date(prescription.date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + medicine.duration);

      const reminder = new MedicineReminder({
        patientId,
        familyMemberId: familyMemberId || null,
        prescriptionId: prescription._id,
        medicineName: medicine.name,
        dosage: medicine.dosage,
        reminderTime: timeSlot,
        startDate,
        endDate,
        isActive: true
      });

      reminders.push(reminder);
    }
  }

  await MedicineReminder.insertMany(reminders);
}

// Parse timing string to time slots
// Smart medicine timing logic - AI auto-assigns default timings if not specified
function parseTiming(timing) {
  // If timing is empty or whitespace, use default timings (Morning, Afternoon, Night)
  if (!timing || !timing.trim()) {
    return ['09:00', '14:00', '21:00']; // Morning, Afternoon, Night
  }

  const timingLower = timing.toLowerCase().trim();
  const timeMap = {
    'morning': '09:00',
    'afternoon': '14:00',
    'evening': '20:00',
    'night': '21:00',
    'breakfast': '08:00',
    'lunch': '13:00',
    'dinner': '20:00'
  };

  // Check if it's a specific time (HH:MM format or HH:MM AM/PM)
  const timePattern = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i;
  const match = timing.match(timePattern);
  
  if (match) {
    let hours = parseInt(match[1]);
    const minutes = match[2];
    const ampm = match[3]?.toLowerCase();

    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    // Return exact time if specified
    return [String(hours).padStart(2, '0') + ':' + minutes];
  }

  // Check for mapped timing
  if (timeMap[timingLower]) {
    return [timeMap[timingLower]];
  }

  // If unclear, use default timings (AI logic - Morning, Afternoon, Night)
  return ['09:00', '14:00', '21:00'];
}

// Upload medical report - REMOVED for regular patients
// Hospitals can no longer upload reports for regular patients - only Lab Portal can upload
// Emergency patients can still have reports uploaded through emergency-specific endpoint

// Upload report for emergency patient (ONLY for emergency patients)
router.post('/emergency-patients/:id/reports', upload.single('report'), [
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

    const emergencyPatient = await EmergencyPatient.findOne({
      _id: req.params.id,
      hospitalId: req.user._id,
      isActive: true
    });

    if (!emergencyPatient) {
      return res.status(404).json({ message: 'Emergency patient not found or discharged' });
    }

    const { reportType, reportName, description } = req.body;

    const report = new MedicalReport({
      patientPhone: `EMG-${emergencyPatient.temporaryId}`,
      patientName: `Emergency Patient - Bed ${emergencyPatient.bedNumber}`,
      patientId: null,
      familyMemberId: null,
      emergencyPatientId: emergencyPatient._id,
      isEmergencyPatient: true,
      hospitalId: req.user._id,
      hospitalName: req.user.hospitalName || req.user.name,
      uploadedBy: 'hospital',
      reportType,
      reportName,
      filePath: `uploads/reports/${req.file.filename}`,
      fileName: req.file.originalname,
      description: description || ''
    });

    await report.save();

    res.json({ 
      message: 'Report uploaded successfully',
      report 
    });
  } catch (error) {
    console.error('Upload emergency report error:', error);
    res.status(500).json({ 
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get prescriptions (privacy-safe - no patient personal info)
router.get('/prescriptions', async (req, res) => {
  try {
    const prescriptions = await Prescription.find({ hospitalId: req.user._id })
      .sort({ date: -1 })
      .select('-patientName -patientPhone -patientId'); // Exclude patient personal info
    
    // Transform to privacy-safe format
    const privacySafePrescriptions = prescriptions.map(prescription => ({
      _id: prescription._id,
      doctorName: prescription.doctorName,
      hospitalName: prescription.hospitalName,
      medicines: prescription.medicines,
      date: prescription.date,
      notes: prescription.notes,
      active: prescription.active,
      isEmergencyPatient: prescription.isEmergencyPatient
    }));
    
    res.json({ prescriptions: privacySafePrescriptions });
  } catch (error) {
    console.error('Get prescriptions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get reports (read-only, privacy-safe - no patient personal info)
router.get('/reports', async (req, res) => {
  try {
    // Get reports uploaded by labs for this hospital's patients
    // OR reports uploaded by this hospital (for emergency patients)
    const reports = await MedicalReport.find({
      $or: [
        { hospitalId: req.user._id, uploadedBy: 'hospital' }, // Hospital's own emergency reports
        { uploadedBy: 'lab' } // Lab reports are visible to all hospitals (privacy-safe)
      ]
    })
    .sort({ date: -1 })
    .select('-patientName -patientPhone -patientId'); // Exclude patient personal info
    
    // Transform to privacy-safe format
    const privacySafeReports = reports.map(report => ({
      _id: report._id,
      reportType: report.reportType,
      reportName: report.reportName,
      fileName: report.fileName,
      date: report.date,
      description: report.description,
      uploadedBy: report.uploadedBy,
      labName: report.labName,
      hospitalName: report.hospitalName,
      isEmergencyPatient: report.isEmergencyPatient
    }));
    
    res.json({ reports: privacySafeReports });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== EMERGENCY / ADMITTED PATIENTS SECTION ====================
// Emergency patients use bed numbers to generate temporary IDs (no personal data required)

// Create emergency patient (admit using bed number only)
router.post('/emergency-patients', [
  body('bedNumber').notEmpty().withMessage('Bed number is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(e => e.msg).join(', ');
      return res.status(400).json({ message: errorMessages, errors: errors.array() });
    }

    const { bedNumber, notes } = req.body;

    // Check if bed is already occupied
    const existingPatient = await EmergencyPatient.findOne({
      bedNumber: bedNumber.trim(),
      hospitalId: req.user._id,
      isActive: true
    });

    if (existingPatient) {
      return res.status(400).json({ message: `Bed ${bedNumber} is already occupied` });
    }

    // Generate temporary ID
    const temporaryId = EmergencyPatient.generateTemporaryId(req.user._id, bedNumber);

    const emergencyPatient = new EmergencyPatient({
      temporaryId,
      bedNumber: bedNumber.trim(),
      hospitalId: req.user._id,
      notes: notes || ''
    });

    await emergencyPatient.save();

    res.json({ 
      message: 'Emergency patient admitted successfully',
      emergencyPatient 
    });
  } catch (error) {
    console.error('Create emergency patient error:', error);
    res.status(500).json({ 
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all emergency patients
router.get('/emergency-patients', async (req, res) => {
  try {
    const { active } = req.query;
    const query = { hospitalId: req.user._id };
    
    if (active === 'true') {
      query.isActive = true;
    }

    const emergencyPatients = await EmergencyPatient.find(query)
      .sort({ admissionDate: -1 });
    
    res.json({ emergencyPatients });
  } catch (error) {
    console.error('Get emergency patients error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get emergency patient by ID
router.get('/emergency-patients/:id', async (req, res) => {
  try {
    const emergencyPatient = await EmergencyPatient.findOne({
      _id: req.params.id,
      hospitalId: req.user._id
    });

    if (!emergencyPatient) {
      return res.status(404).json({ message: 'Emergency patient not found' });
    }

    // Get prescriptions and reports for this emergency patient
    const prescriptions = await Prescription.find({
      emergencyPatientId: emergencyPatient._id
    }).sort({ date: -1 });

    const reports = await MedicalReport.find({
      emergencyPatientId: emergencyPatient._id
    }).sort({ date: -1 });

    res.json({ 
      emergencyPatient,
      prescriptions,
      reports
    });
  } catch (error) {
    console.error('Get emergency patient error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Discharge emergency patient
router.put('/emergency-patients/:id/discharge', async (req, res) => {
  try {
    const emergencyPatient = await EmergencyPatient.findOne({
      _id: req.params.id,
      hospitalId: req.user._id
    });

    if (!emergencyPatient) {
      return res.status(404).json({ message: 'Emergency patient not found' });
    }

    emergencyPatient.isActive = false;
    emergencyPatient.dischargeDate = new Date();
    await emergencyPatient.save();

    res.json({ message: 'Emergency patient discharged successfully' });
  } catch (error) {
    console.error('Discharge emergency patient error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== LEGACY ADMISSIONS (for regular patients with phone) ====================
// Keep this for backward compatibility, but prefer emergency patients for new admissions

// Admit patient (legacy - with phone number)
router.post('/admissions', [
  body('patientPhone').isMobilePhone('any', { strictMode: false }).withMessage('Valid phone number required (e.g., +91XXXXXXXXXX)'),
  body('patientName').notEmpty().withMessage('Patient name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(e => e.msg).join(', ');
      return res.status(400).json({ message: errorMessages, errors: errors.array() });
    }

    const { patientPhone, patientName, notes } = req.body;

    const patient = await User.findOne({ phone: patientPhone, role: 'patient' });

    // Check if already admitted
    const existingAdmission = await Admission.findOne({
      patientPhone,
      hospitalId: req.user._id,
      isActive: true
    });

    if (existingAdmission) {
      return res.status(400).json({ message: 'Patient is already admitted' });
    }

    const admission = new Admission({
      patientId: patient ? patient._id : null,
      hospitalId: req.user._id,
      patientName,
      patientPhone,
      notes: notes || ''
    });

    await admission.save();

    res.json({ 
      message: 'Patient admitted successfully',
      admission 
    });
  } catch (error) {
    console.error('Admit patient error:', error);
    res.status(500).json({ 
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Discharge patient (legacy)
router.put('/admissions/:id/discharge', async (req, res) => {
  try {
    const admission = await Admission.findOne({
      _id: req.params.id,
      hospitalId: req.user._id
    });

    if (!admission) {
      return res.status(404).json({ message: 'Admission not found' });
    }

    admission.isActive = false;
    admission.dischargeDate = new Date();
    await admission.save();

    res.json({ message: 'Patient discharged successfully' });
  } catch (error) {
    console.error('Discharge patient error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get admitted patients (legacy)
router.get('/admissions', async (req, res) => {
  try {
    const { active } = req.query;
    const query = { hospitalId: req.user._id };
    
    if (active === 'true') {
      query.isActive = true;
    }

    const admissions = await Admission.find(query)
      .sort({ admissionDate: -1 });
    
    res.json({ admissions });
  } catch (error) {
    console.error('Get admissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Request patient info access
router.post('/consent/request', [
  body('patientPhone').isMobilePhone('any', { strictMode: false }).withMessage('Valid phone number required (e.g., +91XXXXXXXXXX)'),
  body('patientName').notEmpty().withMessage('Patient name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { patientPhone, patientName } = req.body;

    const patient = await User.findOne({ phone: patientPhone, role: 'patient' });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Check if already has consent
    const existingConsent = await Consent.findOne({
      patientId: patient._id,
      hospitalId: req.user._id,
      status: 'granted'
    });

    if (existingConsent) {
      return res.status(400).json({ message: 'You already have access to this patient' });
    }

    // Check for pending request
    const pendingConsent = await Consent.findOne({
      patientId: patient._id,
      hospitalId: req.user._id,
      status: 'pending'
    });

    if (pendingConsent) {
      return res.status(400).json({ message: 'Consent request already pending' });
    }

    const consent = new Consent({
      patientId: patient._id,
      hospitalId: req.user._id,
      patientName,
      patientPhone,
      status: 'pending'
    });

    await consent.save();

    // Create notification for patient
    await Notification.create({
      userId: patient._id,
      type: 'consent_request',
      title: 'Info Access Request',
      message: `${req.user.hospitalName || req.user.name} is requesting access to your medical information`,
      relatedId: consent._id
    });

    res.json({ 
      message: 'Consent request sent successfully',
      consent 
    });
  } catch (error) {
    console.error('Request consent error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get patient info (with consent) - shows name/phone, editable prescriptions, read-only history
router.get('/patient-info/:patientId', async (req, res) => {
  try {
    const patient = await User.findById(req.params.patientId);

    if (!patient || patient.role !== 'patient') {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Check admission
    const admission = await Admission.findOne({
      patientId: patient._id,
      hospitalId: req.user._id,
      isActive: true
    });

    // Check consent
    const consent = await Consent.findOne({
      patientId: patient._id,
      hospitalId: req.user._id,
      status: 'granted'
    });

    if (!admission && !consent) {
      return res.status(403).json({ message: 'Access denied. No consent or active admission' });
    }

    // Get all prescriptions (editable section)
    const prescriptions = await Prescription.find({
      patientId: patient._id
    }).sort({ date: -1 });

    // Get all reports (read-only history - includes lab reports)
    const reports = await MedicalReport.find({
      patientId: patient._id,
      isEmergencyPatient: false
    }).sort({ date: -1 });

    res.json({
      patient: {
        name: patient.name,
        phone: patient.phone
      },
      prescriptions, // Editable
      reports, // Read-only history
      consentId: consent ? consent._id : null // Include consent ID for revoke
    });
  } catch (error) {
    console.error('Get patient info error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Revoke patient access (temporary access - OK button)
router.put('/consent/:consentId/revoke', async (req, res) => {
  try {
    const consent = await Consent.findOne({
      _id: req.params.consentId,
      hospitalId: req.user._id,
      status: 'granted'
    });

    if (!consent) {
      return res.status(404).json({ message: 'Consent not found or already revoked' });
    }

    // Revoke access
    consent.status = 'revoked';
    consent.revokedAt = new Date();
    await consent.save();

    // Notify patient
    await Notification.create({
      userId: consent.patientId,
      type: 'consent_revoked',
      title: 'Access Revoked',
      message: `${req.user.hospitalName || req.user.name} has revoked access to your medical information`,
      relatedId: consent._id
    });

    res.json({ message: 'Access revoked successfully' });
  } catch (error) {
    console.error('Revoke consent error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update prescription (for patient info access - editable prescriptions)
router.put('/prescriptions/:id', [
  body('medicines').isArray({ min: 1 }).withMessage('At least one medicine is required'),
  body('medicines.*.name').notEmpty().withMessage('Medicine name is required'),
  body('medicines.*.dosage').notEmpty().withMessage('Medicine dosage is required'),
  body('medicines.*.timing').notEmpty().withMessage('Medicine timing is required'),
  body('medicines.*.duration').isInt({ min: 1 }).withMessage('Valid duration in days is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const prescription = await Prescription.findOne({
      _id: req.params.id,
      hospitalId: req.user._id
    });

    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }

    const { medicines, notes } = req.body;

    // Update prescription
    prescription.medicines = medicines;
    prescription.notes = notes || prescription.notes;
    await prescription.save();

    // Update medicine reminders if patient exists
    if (prescription.patientId) {
      // Remove old reminders
      await MedicineReminder.deleteMany({ prescriptionId: prescription._id });
      
      // Create new reminders
      await createMedicineReminders(prescription.patientId, prescription.familyMemberId, prescription);
    }

    res.json({ 
      message: 'Prescription updated successfully',
      prescription 
    });
  } catch (error) {
    console.error('Update prescription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get consent requests
router.get('/consents', async (req, res) => {
  try {
    const consents = await Consent.find({ hospitalId: req.user._id })
      .sort({ requestedAt: -1 });
    
    res.json({ consents });
  } catch (error) {
    console.error('Get consents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


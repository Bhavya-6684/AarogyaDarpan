const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const generateOTP = require('../utils/generateOTP');
const sendSMS = require('../utils/sendSMS');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your_secret_key', {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Patient Signup
router.post('/patient/signup', [
  body('phone').isMobilePhone('any', { strictMode: false }).withMessage('Valid phone number required (e.g., +91XXXXXXXXXX)'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().withMessage('Name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(e => e.msg).join(', ');
      return res.status(400).json({ message: errorMessages, errors: errors.array() });
    }

    const { phone, password, name } = req.body;

    // Check if user exists
    let user = await User.findOne({ phone });
    if (user) {
      return res.status(400).json({ message: 'Phone number already registered' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user (unverified)
    user = new User({
      phone,
      password,
      name,
      role: 'patient',
      isVerified: false,
      otp,
      otpExpiry
    });

    await user.save();

    // Send OTP SMS
    await sendSMS(phone, `Your OTP for Aarogya Darpan signup is: ${otp}. Valid for 10 minutes.`);

    res.json({ 
      message: 'OTP sent to your phone number',
      userId: user._id,
      otp: process.env.NODE_ENV === 'development' ? otp : undefined // Only return OTP in development
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Verify OTP
router.post('/patient/verify-otp', [
  body('userId').notEmpty().withMessage('User ID required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'User already verified' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Patient Login
router.post('/patient/login', [
  body('phone').isMobilePhone('any', { strictMode: false }).withMessage('Valid phone number required (e.g., +91XXXXXXXXXX)'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { phone, password } = req.body;

    const user = await User.findOne({ phone, role: 'patient' });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(401).json({ message: 'Please verify your account first' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Hospital/Doctor Signup
router.post('/hospital/signup', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().withMessage('Name is required'),
  body('hospitalName').notEmpty().withMessage('Hospital name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, hospitalName } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    user = new User({
      email,
      password,
      name,
      hospitalName,
      role: 'hospital',
      isVerified: true // Hospitals are auto-verified
    });

    await user.save();

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        hospitalName: user.hospitalName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Hospital signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Hospital/Doctor Login
router.post('/hospital/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email, role: 'hospital' });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        hospitalName: user.hospitalName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Hospital login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Password Reset Request
router.post('/patient/forgot-password', [
  body('phone').isMobilePhone('any', { strictMode: false }).withMessage('Valid phone number required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { phone } = req.body;

    const user = await User.findOne({ phone, role: 'patient' });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendSMS(phone, `Your password reset OTP is: ${otp}. Valid for 10 minutes.`);

    res.json({ message: 'OTP sent to your phone number', userId: user._id });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset Password
router.post('/patient/reset-password', [
  body('userId').notEmpty().withMessage('User ID required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, otp, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    user.password = newPassword;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lab/Doctor Signup
router.post('/lab/signup', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().withMessage('Lab name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    user = new User({
      email,
      password,
      name,
      role: 'lab',
      isVerified: true // Labs are auto-verified
    });

    await user.save();

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Lab signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lab Login
router.post('/lab/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email, role: 'lab' });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Lab login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      phone: req.user.phone,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      hospitalName: req.user.hospitalName,
      profilePhoto: req.user.profilePhoto
    }
  });
});

module.exports = router;


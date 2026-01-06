const express = require('express');
const { auth } = require('../middleware/auth');
const MedicineReminder = require('../models/MedicineReminder');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Mark reminder as completed
router.put('/:id/complete', async (req, res) => {
  try {
    const reminder = await MedicineReminder.findOne({
      _id: req.params.id,
      patientId: req.user._id
    });

    if (!reminder) {
      return res.status(404).json({ message: 'Reminder not found' });
    }

    reminder.completed = true;
    reminder.isActive = false;
    await reminder.save();

    res.json({ message: 'Reminder marked as completed' });
  } catch (error) {
    console.error('Complete reminder error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle reminder active status
router.put('/:id/toggle', async (req, res) => {
  try {
    const reminder = await MedicineReminder.findOne({
      _id: req.params.id,
      patientId: req.user._id
    });

    if (!reminder) {
      return res.status(404).json({ message: 'Reminder not found' });
    }

    reminder.isActive = !reminder.isActive;
    await reminder.save();

    res.json({ 
      message: `Reminder ${reminder.isActive ? 'activated' : 'deactivated'}`,
      reminder 
    });
  } catch (error) {
    console.error('Toggle reminder error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


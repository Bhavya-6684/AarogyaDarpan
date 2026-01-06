const cron = require('node-cron');
const MedicineReminder = require('../models/MedicineReminder');
const sendSMS = require('./sendSMS');
const User = require('../models/User');

// Run every minute to check for reminders
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Find active reminders for current time
    const reminders = await MedicineReminder.find({
      isActive: true,
      completed: false,
      reminderTime: currentTime,
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).populate('patientId', 'phone name');

    for (const reminder of reminders) {
      // Check if reminder was already sent today
      const lastSentDate = reminder.lastSent ? new Date(reminder.lastSent).setHours(0, 0, 0, 0) : null;
      const todayDate = today.getTime();

      if (lastSentDate !== todayDate && reminder.patientId) {
        const message = `🔔 Medicine Reminder: Take ${reminder.medicineName} (${reminder.dosage}) now (${reminder.reminderTime})`;
        
        if (reminder.patientId.phone) {
          await sendSMS(reminder.patientId.phone, message);
        }

        // Update last sent time
        reminder.lastSent = now;
        await reminder.save();

        console.log(`Reminder sent: ${reminder.medicineName} to ${reminder.patientId.phone}`);
      }
    }
  } catch (error) {
    console.error('Error in reminder scheduler:', error);
  }
});

console.log('Medicine reminder scheduler started');


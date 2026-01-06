// SMS sending utility using Twilio
// For development, you can mock this or use Twilio

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;

try {
  if (accountSid && authToken) {
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
  }
} catch (error) {
  console.log('Twilio not configured, SMS will be logged to console');
}

const sendSMS = async (to, message) => {
  if (twilioClient && twilioPhone) {
    try {
      await twilioClient.messages.create({
        body: message,
        from: twilioPhone,
        to: to
      });
      console.log(`SMS sent to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);
      return false;
    }
  } else {
    // For development - log to console
    console.log(`[SMS] To: ${to}, Message: ${message}`);
    return true;
  }
};

module.exports = sendSMS;


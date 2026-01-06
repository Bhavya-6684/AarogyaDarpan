const express = require('express');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Simple AI chatbot (rule-based for medicine questions)
router.post('/chat', [
  body('message').notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { message } = req.body;
    const response = generateChatbotResponse(message.toLowerCase());

    res.json({ response });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

function generateChatbotResponse(message) {
  // Medicine usage patterns
  if (message.includes('how to take') || message.includes('how should i take')) {
    return 'Please follow the dosage and timing instructions provided in your prescription. Take medicines with water, unless otherwise specified. If you have specific concerns, consult your doctor.';
  }

  if (message.includes('side effect') || message.includes('side effects')) {
    return 'Side effects vary by medication. Common ones include nausea, dizziness, or drowsiness. If you experience severe side effects, stop taking the medicine and contact your doctor immediately.';
  }

  if (message.includes('missed') || message.includes('forgot to take')) {
    return 'If you missed a dose, take it as soon as you remember. However, if it\'s almost time for your next dose, skip the missed one and continue with your regular schedule. Never double the dose.';
  }

  if (message.includes('before food') || message.includes('after food') || message.includes('with food')) {
    return 'Always follow the instructions on your prescription. Some medicines should be taken before meals, some after, and some with food. Check your prescription details for specific timing instructions.';
  }

  if (message.includes('expired') || message.includes('expiry')) {
    return 'Do not take expired medicines. Check the expiry date on the medicine package. Dispose of expired medicines properly at a pharmacy.';
  }

  if (message.includes('diagnosis') || message.includes('what is wrong') || message.includes('what disease')) {
    return 'I cannot provide medical diagnoses. Please consult with your healthcare provider for diagnosis and treatment recommendations.';
  }

  if (message.includes('emergency') || message.includes('urgent')) {
    return 'For medical emergencies, please contact your local emergency services immediately or visit the nearest hospital. Do not rely on this chatbot for emergency situations.';
  }

  // Report explanations
  if (message.includes('blood test') || message.includes('lab report')) {
    return 'Blood test results should be interpreted by a qualified healthcare professional. Values are compared to normal ranges, and context matters. Please discuss your results with your doctor.';
  }

  if (message.includes('x-ray') || message.includes('ct scan') || message.includes('mri')) {
    return 'Imaging reports like X-rays, CT scans, and MRIs require professional interpretation by a radiologist or your doctor. They can explain what the images show and what they mean for your health.';
  }

  // Default response
  return 'I can help with general medicine usage questions, reminders, and basic report explanations. However, I cannot provide medical diagnoses. For specific medical advice, please consult your healthcare provider. How can I assist you?';
}

module.exports = router;


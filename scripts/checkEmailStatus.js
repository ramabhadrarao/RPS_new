// scripts/checkEmailStatus.js
require('dotenv').config();

// Add this to your authController.js temporarily to see email status
// In controllers/authController.js, modify the signup method:

// After this line:
// res.status(201).json(response);

// Add console logs in the setImmediate block:
setImmediate(async () => {
  try {
    console.log('📧 Attempting to send verification email to:', email);
    console.log('📧 Email service:', process.env.EMAIL_SERVICE);
    console.log('📧 From email:', process.env.EMAIL_FROM);
    
    await EmailService.sendWelcome({
      ...newUser.toObject(),
      emailVerificationToken: verifyToken
    });
    
    console.log('✅ Verification email sent successfully to:', email);
  } catch (error) {
    console.error('❌ Failed to send verification email:', error.message);
    console.error('Full error:', error);
  }
});

// Also check your email service configuration
console.log('\n=== Email Configuration Check ===');
console.log('EMAIL_SERVICE:', process.env.EMAIL_SERVICE);
console.log('EMAIL_USERNAME:', process.env.EMAIL_USERNAME);
console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('Has PASSWORD:', process.env.EMAIL_PASSWORD ? 'Yes' : 'No');
console.log('================================\n');
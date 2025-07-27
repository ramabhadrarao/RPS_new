// scripts/testForgotPasswordDetailed.js
require('dotenv').config();

async function testForgotPasswordDetailed() {
  console.log('🔍 Forgot Password Debugging');
  console.log('============================\n');
  
  // 1. Check environment
  console.log('1. Environment Check:');
  console.log('   NODE_ENV:', process.env.NODE_ENV);
  console.log('   APP_URL:', process.env.APP_URL);
  console.log('   EMAIL_SERVICE:', process.env.EMAIL_SERVICE);
  console.log('   EMAIL_FROM:', process.env.EMAIL_FROM);
  console.log('   Test Email:', process.env.EMAIL_USERNAME);
  
  // 2. Test database connection and user
  console.log('\n2. Database Check:');
  const mongoose = require('mongoose');
  const User = require('../models/User');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('   ✓ Connected to MongoDB');
    
    // Check if user exists
    const testEmail = 'ramabhadrarao1981@gmail.com';
    const user = await User.findOne({ email: testEmail });
    
    if (user) {
      console.log(`   ✓ User found: ${user.email}`);
      console.log(`     Name: ${user.firstName} ${user.lastName}`);
      console.log(`     Verified: ${user.isEmailVerified}`);
    } else {
      console.log(`   ✗ User not found with email: ${testEmail}`);
      console.log('   Creating test user...');
      
      const newUser = await User.create({
        email: testEmail,
        password: 'Test@123',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true
      });
      
      console.log('   ✓ Test user created');
    }
  } catch (error) {
    console.error('   ✗ Database error:', error.message);
  }
  
  // 3. Test email service directly
  console.log('\n3. Testing Email Service Directly:');
  const EmailService = require('../services/emailService');
  
  try {
    // Test with a simple email first
    const testResult = await EmailService.sendTestEmail(process.env.EMAIL_USERNAME);
    console.log('   ✓ Test email sent successfully');
    console.log('   Message ID:', testResult.messageId);
  } catch (error) {
    console.error('   ✗ Email test failed:', error.message);
  }
  
  // 4. Test password reset flow
  console.log('\n4. Testing Password Reset Flow:');
  const axios = require('axios');
  const baseUrl = process.env.APP_URL || 'http://localhost:5000';
  
  try {
    console.log(`   Sending POST to ${baseUrl}/api/v1/auth/forgot-password`);
    
    const response = await axios.post(
      `${baseUrl}/api/v1/auth/forgot-password`,
      { email: 'ramabhadrarao1981@gmail.com' },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000 // 30 second timeout
      }
    );
    
    console.log('   ✓ Response received:', response.data);
    
    if (response.data.resetUrl) {
      console.log('\n   🔗 Reset URL:', response.data.resetUrl);
      console.log('   Open this URL in your browser to test the password reset form');
    }
  } catch (error) {
    if (error.response) {
      console.error('   ✗ Server error:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('   ✗ No response received. Is the server running on port 5000?');
    } else {
      console.error('   ✗ Request error:', error.message);
    }
  }
  
  // 5. Direct password reset token test
  console.log('\n5. Testing Password Reset Token Generation:');
  try {
    const user = await User.findOne({ email: 'ramabhadrarao1981@gmail.com' });
    if (user) {
      const resetToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });
      
      console.log('   ✓ Reset token generated');
      console.log('   Token (first 10 chars):', resetToken.substring(0, 10) + '...');
      console.log('   Reset URL:', `${baseUrl}/api/v1/auth/reset-password/${resetToken}`);
      
      // Test sending email directly
      console.log('\n   Sending password reset email directly...');
      try {
        const emailResult = await EmailService.sendPasswordReset(
          user,
          `${baseUrl}/api/v1/auth/reset-password/${resetToken}`
        );
        console.log('   ✓ Password reset email sent!');
        console.log('   Check your inbox for:', user.email);
      } catch (emailError) {
        console.error('   ✗ Email send error:', emailError.message);
      }
    }
  } catch (error) {
    console.error('   ✗ Token generation error:', error.message);
  }
  
  console.log('\n✅ Testing complete!');
  console.log('Check your email inbox and spam folder.');
  
  // Keep connection alive for a moment to allow async operations to complete
  setTimeout(() => {
    mongoose.connection.close();
    process.exit(0);
  }, 5000);
}

// Run the test
testForgotPasswordDetailed().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
// scripts/debugEmail.js
require('dotenv').config();
const nodemailer = require('nodemailer');

async function debugEmailService() {
  console.log('🔍 Email Service Debugging');
  console.log('==========================\n');
  
  // 1. Check configuration
  console.log('1. Configuration Check:');
  console.log('   EMAIL_SERVICE:', process.env.EMAIL_SERVICE);
  console.log('   EMAIL_USERNAME:', process.env.EMAIL_USERNAME);
  console.log('   EMAIL_FROM:', process.env.EMAIL_FROM);
  console.log('   Has PASSWORD:', process.env.EMAIL_PASSWORD ? '✓ Yes' : '✗ No');
  console.log('   PASSWORD length:', process.env.EMAIL_PASSWORD?.length || 0);
  
  // 2. Test direct connection
  console.log('\n2. Testing Gmail Connection...');
  const startTime = Date.now();
  
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      },
      // Add debugging
      debug: true,
      logger: true
    });
    
    // Verify connection
    await transporter.verify();
    const connectionTime = Date.now() - startTime;
    console.log(`   ✓ Connected successfully in ${connectionTime}ms`);
    
    // 3. Send test email with timing
    console.log('\n3. Sending Test Email...');
    const sendStartTime = Date.now();
    
    const info = await transporter.sendMail({
      from: `"ATS Test" <${process.env.EMAIL_FROM}>`,
      to: process.env.EMAIL_USERNAME, // Send to yourself
      subject: `Test Email - ${new Date().toLocaleTimeString()}`,
      text: 'This is a test email to check delivery speed',
      html: `
        <h2>Email Delivery Test</h2>
        <p>Sent at: ${new Date().toLocaleString()}</p>
        <p>If you receive this, email is working!</p>
      `
    });
    
    const sendTime = Date.now() - sendStartTime;
    console.log(`   ✓ Email sent in ${sendTime}ms`);
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    
    // 4. Common issues check
    console.log('\n4. Common Issues Check:');
    
    // Check if 2-factor auth is needed
    if (process.env.EMAIL_PASSWORD?.includes(' ')) {
      console.log('   ✓ App password format looks correct (has spaces)');
    } else {
      console.log('   ⚠️  Password might not be an app password');
    }
    
    console.log('\n✅ Email service is working correctly!');
    console.log(`Total time: ${Date.now() - startTime}ms`);
    
  } catch (error) {
    console.error('\n❌ Email Error:', error.message);
    
    // Detailed error analysis
    if (error.message.includes('Invalid login')) {
      console.error('\n⚠️  Authentication Issue:');
      console.error('   1. Make sure 2-factor authentication is enabled on Gmail');
      console.error('   2. Generate an app password at:');
      console.error('      https://myaccount.google.com/apppasswords');
      console.error('   3. Use the 16-character app password (with spaces)');
    } else if (error.message.includes('self signed certificate')) {
      console.error('\n⚠️  Certificate Issue:');
      console.error('   Try adding to your .env:');
      console.error('   NODE_TLS_REJECT_UNAUTHORIZED=0');
    } else if (error.message.includes('ETIMEDOUT')) {
      console.error('\n⚠️  Network Issue:');
      console.error('   - Check your internet connection');
      console.error('   - Check if Gmail is accessible');
      console.error('   - Try using a VPN if Gmail is blocked');
    }
  }
}

// Run the debug
debugEmailService().catch(console.error);
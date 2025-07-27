// controllers/authController.js
const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const { AppError } = require('../utils/appError');
const EmailService = require('../services/emailService');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// Create JWT token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

// Create and send token
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };
  
  res.cookie('jwt', token, cookieOptions);
  
  // Remove sensitive data
  user.password = undefined;
  user.emailVerificationToken = undefined;
  
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

// Enhanced Signup - Async email sending
exports.signup = catchAsync(async (req, res, next) => {
  const { email, password, firstName, lastName, role } = req.body;
  
  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already registered', 400));
  }
  
  // Generate verification token
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto
    .createHash('sha256')
    .update(verifyToken)
    .digest('hex');
  
  // Development mode - auto verify option
  const autoVerify = process.env.NODE_ENV === 'development' && 
                    process.env.AUTO_VERIFY_EMAIL === 'true';
  
  // Create user
  const newUser = await User.create({
    email,
    password,
    firstName,
    lastName,
    role: role || 'recruiter',
    emailVerificationToken: autoVerify ? undefined : hashedToken,
    emailVerificationExpires: autoVerify ? undefined : Date.now() + 24 * 60 * 60 * 1000,
    isEmailVerified: autoVerify
  });
  
  // Response immediately - don't wait for email
  const response = {
    status: 'success',
    message: autoVerify 
      ? 'Account created successfully! You can now log in.' 
      : 'Registration successful! Please check your email to verify your account.',
    data: {
      userId: newUser._id,
      email: newUser.email,
      emailVerified: newUser.isEmailVerified
    }
  };
  
  // Development mode - include verification link
  if (process.env.NODE_ENV === 'development' && !autoVerify) {
    response.data.verificationUrl = `${process.env.APP_URL}/api/v1/auth/verify-email-form/${verifyToken}`;
  }
  
  res.status(201).json(response);
  
  // Send email asynchronously (after response)
  if (!autoVerify) {
    setImmediate(async () => {
      try {
        console.log('📧 Attempting to send verification email...');
        console.log('   To:', email);
        console.log('   Service:', process.env.EMAIL_SERVICE);
        console.log('   From:', process.env.EMAIL_FROM);
        
        const emailResult = await EmailService.sendWelcome({
          ...newUser.toObject(),
          emailVerificationToken: verifyToken
        });
        
        console.log('✅ Email sent successfully!');
        console.log('   Message ID:', emailResult?.messageId || 'N/A');
        console.log(`   Check inbox for: ${email}`);
      } catch (error) {
        console.error('❌ Failed to send verification email:');
        console.error('   Error:', error.message);
        console.error('   Full error:', error);
        // Log error but don't affect user experience
      }
    });
  }
});

// Login with flexible verification
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Validation
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }
  
  // Find user
  const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
  
  // Check account lock
  if (user && user.isLocked) {
    return next(new AppError('Account locked due to too many failed login attempts. Try again later.', 423));
  }
  
  // Verify credentials
  if (!user || !(await user.comparePassword(password))) {
    if (user) {
      // Update failed attempts
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
      }
      await user.save({ validateBeforeSave: false });
    }
    return next(new AppError('Incorrect email or password', 401));
  }
  
  // Check if active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated', 401));
  }
  
  // Email verification check with grace period
  if (!user.isEmailVerified) {
    const accountAge = Date.now() - user.createdAt.getTime();
    const gracePeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Allow login during grace period but show warning
    if (accountAge < gracePeriod) {
      // Reset login attempts
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      user.lastLogin = Date.now();
      await user.save({ validateBeforeSave: false });
      
      // Create token with warning
      const token = signToken(user._id);
      
      return res.status(200).json({
        status: 'warning',
        message: 'Please verify your email address to ensure continued access.',
        token,
        data: {
          user: {
            ...user.toObject(),
            password: undefined,
            emailVerified: false,
            gracePeriodEnds: new Date(user.createdAt.getTime() + gracePeriod)
          }
        }
      });
    } else {
      // After grace period, require verification
      return next(new AppError('Email verification required. Please check your email or request a new verification link.', 401));
    }
  }
  
  // Successful login
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });
  
  // Check 2FA
  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign({ id: user._id, require2FA: true }, process.env.JWT_SECRET, {
      expiresIn: '10m'
    });
    
    return res.status(200).json({
      status: 'success',
      message: '2FA required',
      tempToken
    });
  }
  
  createSendToken(user, 200, res);
});

// Email verification via API
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new AppError('Invalid or expired verification token', 400));
  }
  
  // Update user
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });
  
  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully!'
  });
});

// Serve email verification form
exports.getVerifyEmailForm = catchAsync(async (req, res, next) => {
  const token = req.params.token;
  
  // Simple HTML form with fixed URLs
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Email Verification - ATS Platform</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    h1 {
      color: #2563eb;
      margin-bottom: 20px;
    }
    .btn {
      background-color: #2563eb;
      color: white;
      padding: 12px 30px;
      border: none;
      border-radius: 5px;
      font-size: 16px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      margin: 10px;
    }
    .btn:hover {
      background-color: #1d4ed8;
    }
    .btn-secondary {
      background-color: #6b7280;
    }
    .btn-secondary:hover {
      background-color: #4b5563;
    }
    .message {
      margin: 20px 0;
      padding: 15px;
      border-radius: 5px;
    }
    .success {
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .error {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #2563eb;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Email Verification</h1>
    <p>Click the button below to verify your email address</p>
    
    <div id="content">
      <button onclick="verifyEmail()" class="btn">Verify Email</button>
      <br>
      <a href="${appUrl}" class="btn btn-secondary">Go to Home</a>
    </div>
    
    <div id="loading" style="display: none;">
      <div class="spinner"></div>
      <p>Verifying your email...</p>
    </div>
    
    <div id="result"></div>
  </div>
  
  <script>
    async function verifyEmail() {
      document.getElementById('content').style.display = 'none';
      document.getElementById('loading').style.display = 'block';
      
      try {
        const response = await fetch('${appUrl}/api/v1/auth/verify-email/${token}', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include'
        });
        
        const data = await response.json();
        
        document.getElementById('loading').style.display = 'none';
        
        if (data.status === 'success') {
          document.getElementById('result').innerHTML = 
            '<div class="message success">' + 
            '<h2>✓ Email Verified Successfully!</h2>' +
            '<p>You can now log in to your account.</p>' +
            '<a href="${appUrl}" class="btn">Go to Login</a>' +
            '</div>';
        } else {
          throw new Error(data.message || 'Verification failed');
        }
      } catch (error) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        document.getElementById('result').innerHTML = 
          '<div class="message error">' + 
          '<p>Error: ' + error.message + '</p>' +
          '</div>';
      }
    }
  </script>
</body>
</html>
  `;
  
  res.status(200).type('html').send(html);
});

// Submit email verification (form POST)
exports.submitEmailVerification = catchAsync(async (req, res, next) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).send('Invalid request');
  }
  
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return res.status(400).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #dc3545;">Verification Failed</h1>
          <p>Invalid or expired verification token.</p>
          <a href="${process.env.APP_URL}/resend-verification" style="color: #2563eb;">Request new verification email</a>
        </body>
      </html>
    `);
  }
  
  // Update user
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });
  
  // Redirect to success page or login
  res.redirect(`${process.env.APP_URL}/login?verified=true`);
});

// Resend verification with rate limiting
exports.resendVerification = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    return next(new AppError('Please provide an email address', 400));
  }
  
  const user = await User.findOne({ email });
  
  if (!user) {
    // Don't reveal if user exists
    return res.status(200).json({
      status: 'success',
      message: 'If an account exists with this email, a verification email has been sent.'
    });
  }
  
  if (user.isEmailVerified) {
    return next(new AppError('Email is already verified', 400));
  }
  
  // Rate limiting check
  if (user.lastVerificationEmailSent) {
    const timeSinceLastEmail = Date.now() - user.lastVerificationEmailSent.getTime();
    const minInterval = process.env.NODE_ENV === 'production' ? 60000 : 10000; // 1 min prod, 10 sec dev
    
    if (timeSinceLastEmail < minInterval) {
      const waitTime = Math.ceil((minInterval - timeSinceLastEmail) / 1000);
      return next(new AppError(`Please wait ${waitTime} seconds before requesting another email`, 429));
    }
  }
  
  // Generate new token
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto
    .createHash('sha256')
    .update(verifyToken)
    .digest('hex');
  
  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  user.lastVerificationEmailSent = Date.now();
  await user.save({ validateBeforeSave: false });
  
  // Send email asynchronously
  setImmediate(async () => {
    try {
      await EmailService.sendWelcome({
        ...user.toObject(),
        emailVerificationToken: verifyToken
      });
    } catch (error) {
      console.error('Failed to send verification email:', error);
    }
  });
  
  res.status(200).json({
    status: 'success',
    message: 'Verification email sent. Please check your inbox.'
  });
});

// Quick development login
exports.devLogin = catchAsync(async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Not available in production', 403));
  }
  
  const { email } = req.body;
  const user = await User.findOne({ email });
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Auto verify and login
  user.isEmailVerified = true;
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  await user.save({ validateBeforeSave: false });
  
  createSendToken(user, 200, res);
});

// Check email verification status
exports.checkVerificationStatus = catchAsync(async (req, res, next) => {
  const { email } = req.params;
  
  const user = await User.findOne({ email }).select('isEmailVerified createdAt');
  
  if (!user) {
    return res.status(200).json({
      status: 'success',
      data: { exists: false }
    });
  }
  
  const accountAge = Date.now() - user.createdAt.getTime();
  const gracePeriod = 7 * 24 * 60 * 60 * 1000;
  
  res.status(200).json({
    status: 'success',
    data: {
      exists: true,
      verified: user.isEmailVerified,
      inGracePeriod: !user.isEmailVerified && accountAge < gracePeriod,
      gracePeriodEnds: !user.isEmailVerified ? new Date(user.createdAt.getTime() + gracePeriod) : null
    }
  });
});

// Logout
exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.status(200).json({ status: 'success' });
};

// Forgot password
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    return next(new AppError('Please provide an email address', 400));
  }
  
  console.log('🔐 Password reset requested for:', email);
  
  // Find user with case-insensitive email
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    console.log('   User not found, but returning success for security');
    // Don't reveal if user exists
    return res.status(200).json({
      status: 'success',
      message: 'If an account exists with this email, a password reset link has been sent.'
    });
  }
  
  console.log('   User found:', user.email);
  
  try {
    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    
    console.log('   Reset token generated');
    
    // Build reset URL
    const resetURL = `${process.env.APP_URL}/api/v1/auth/reset-password/${resetToken}`;
    console.log('   Reset URL:', resetURL);
    
    // Send email synchronously to ensure it completes
    console.log('   Attempting to send email...');
    const emailResult = await EmailService.sendPasswordReset(user, resetURL);
    
    console.log('   ✅ Email sent successfully!');
    console.log('   Message ID:', emailResult.messageId);
    
    res.status(200).json({
      status: 'success',
      message: 'Password reset link sent to email!',
      // Include additional info in development
      ...(process.env.NODE_ENV === 'development' && { 
        resetUrl: resetURL,
        emailSent: true,
        messageId: emailResult.messageId
      })
    });
    
  } catch (error) {
    console.error('   ❌ Failed to send password reset email:', error.message);
    console.error('   Full error:', error);
    
    // Revert the password reset token
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    
    // In development, show the actual error
    if (process.env.NODE_ENV === 'development') {
      return next(new AppError(`Email sending failed: ${error.message}`, 500));
    }
    
    return next(new AppError('There was an error sending the email. Please try again.', 500));
  }
});
// Get password reset form
exports.getPasswordResetForm = catchAsync(async (req, res, next) => {
  const token = req.params.token;
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
  
  // Simple HTML form for password reset
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Reset Password - ATS Platform</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    h1 {
      color: #2563eb;
      margin-bottom: 20px;
    }
    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }
    label {
      display: block;
      margin-bottom: 5px;
      color: #374151;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 5px;
      font-size: 16px;
      box-sizing: border-box;
    }
    input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    .btn {
      background-color: #2563eb;
      color: white;
      padding: 12px 30px;
      border: none;
      border-radius: 5px;
      font-size: 16px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      margin: 10px 0;
      width: 100%;
    }
    .btn:hover {
      background-color: #1d4ed8;
    }
    .btn:disabled {
      background-color: #9ca3af;
      cursor: not-allowed;
    }
    .message {
      margin: 20px 0;
      padding: 15px;
      border-radius: 5px;
    }
    .success {
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .error {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #2563eb;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .password-requirements {
      font-size: 12px;
      color: #6b7280;
      margin-top: 5px;
      text-align: left;
    }
    .requirement {
      margin: 2px 0;
    }
    .requirement.valid {
      color: #10b981;
    }
    .requirement.invalid {
      color: #ef4444;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Reset Your Password</h1>
    <p>Enter your new password below</p>
    
    <div id="content">
      <form id="resetForm">
        <div class="form-group">
          <label for="password">New Password</label>
          <input 
            type="password" 
            id="password" 
            name="password" 
            required
            placeholder="Enter new password"
          >
          <div class="password-requirements">
            <div class="requirement" id="req-length">• At least 8 characters</div>
            <div class="requirement" id="req-upper">• One uppercase letter</div>
            <div class="requirement" id="req-lower">• One lowercase letter</div>
            <div class="requirement" id="req-number">• One number</div>
            <div class="requirement" id="req-special">• One special character</div>
          </div>
        </div>
        
        <div class="form-group">
          <label for="confirmPassword">Confirm Password</label>
          <input 
            type="password" 
            id="confirmPassword" 
            name="confirmPassword" 
            required
            placeholder="Confirm new password"
          >
        </div>
        
        <button type="submit" class="btn" id="submitBtn">Reset Password</button>
      </form>
    </div>
    
    <div id="loading" style="display: none;">
      <div class="spinner"></div>
      <p>Resetting your password...</p>
    </div>
    
    <div id="result"></div>
  </div>
  
  <script>
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('submitBtn');
    
    // Password validation
    function validatePassword(pass) {
      const requirements = {
        length: pass.length >= 8,
        upper: /[A-Z]/.test(pass),
        lower: /[a-z]/.test(pass),
        number: /[0-9]/.test(pass),
        special: /[!@#$%^&*]/.test(pass)
      };
      
      // Update UI
      document.getElementById('req-length').className = 'requirement ' + (requirements.length ? 'valid' : 'invalid');
      document.getElementById('req-upper').className = 'requirement ' + (requirements.upper ? 'valid' : 'invalid');
      document.getElementById('req-lower').className = 'requirement ' + (requirements.lower ? 'valid' : 'invalid');
      document.getElementById('req-number').className = 'requirement ' + (requirements.number ? 'valid' : 'invalid');
      document.getElementById('req-special').className = 'requirement ' + (requirements.special ? 'valid' : 'invalid');
      
      return Object.values(requirements).every(req => req === true);
    }
    
    password.addEventListener('input', (e) => {
      validatePassword(e.target.value);
    });
    
    document.getElementById('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const passwordValue = password.value;
      const confirmValue = confirmPassword.value;
      
      // Validate password
      if (!validatePassword(passwordValue)) {
        document.getElementById('result').innerHTML = 
          '<div class="message error">Please meet all password requirements</div>';
        return;
      }
      
      // Check passwords match
      if (passwordValue !== confirmValue) {
        document.getElementById('result').innerHTML = 
          '<div class="message error">Passwords do not match</div>';
        return;
      }
      
      document.getElementById('content').style.display = 'none';
      document.getElementById('loading').style.display = 'block';
      document.getElementById('result').innerHTML = '';
      
      try {
        const response = await fetch('${appUrl}/api/v1/auth/reset-password/${token}', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ password: passwordValue }),
          credentials: 'include'
        });
        
        const data = await response.json();
        
        document.getElementById('loading').style.display = 'none';
        
        if (data.status === 'success') {
          document.getElementById('result').innerHTML = 
            '<div class="message success">' + 
            '<h2>✓ Password Reset Successfully!</h2>' +
            '<p>You have been logged in with your new password.</p>' +
            '<a href="${appUrl}" class="btn">Go to Dashboard</a>' +
            '</div>';
        } else {
          throw new Error(data.message || 'Password reset failed');
        }
      } catch (error) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        document.getElementById('result').innerHTML = 
          '<div class="message error">' + 
          '<p>Error: ' + error.message + '</p>' +
          '<p>The reset link may have expired. Please request a new one.</p>' +
          '</div>';
      }
    });
  </script>
</body>
</html>
  `;
  
  res.status(200).type('html').send(html);
});

// Reset password API endpoint
exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  
  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  
  createSendToken(user, 200, res);
});

// Update password
exports.updatePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');
  
  if (!(await user.comparePassword(req.body.currentPassword))) {
    return next(new AppError('Your current password is incorrect.', 401));
  }
  
  user.password = req.body.newPassword;
  await user.save();
  
  createSendToken(user, 200, res);
});

// Get current user
exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
});

// Update current user
exports.updateMe = catchAsync(async (req, res, next) => {
  if (req.body.password) {
    return next(new AppError('This route is not for password updates. Please use /update-password.', 400));
  }
  
  const filteredBody = {};
  const allowedFields = ['firstName', 'lastName', 'email'];
  
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });
  
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser
    }
  });
});

// Delete current user
exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { isActive: false });
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// 2FA methods
exports.enable2FA = catchAsync(async (req, res, next) => {
  const secret = speakeasy.generateSecret({
    name: `ATS Platform (${req.user.email})`
  });
  
  req.user.twoFactorSecret = secret.base32;
  await req.user.save({ validateBeforeSave: false });
  
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
  
  res.status(200).json({
    status: 'success',
    data: {
      secret: secret.base32,
      qrCode: qrCodeUrl
    }
  });
});

exports.verify2FA = catchAsync(async (req, res, next) => {
  const { token } = req.body;
  
  const verified = speakeasy.totp.verify({
    secret: req.user.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 1
  });
  
  if (!verified) {
    return next(new AppError('Invalid 2FA token', 401));
  }
  
  req.user.twoFactorEnabled = true;
  await req.user.save({ validateBeforeSave: false });
  
  createSendToken(req.user, 200, res);
});

exports.disable2FA = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  if (!user.twoFactorEnabled) {
    return next(new AppError('2FA is not enabled', 400));
  }
  
  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  await user.save({ validateBeforeSave: false });
  
  res.status(200).json({
    status: 'success',
    message: '2FA disabled successfully'
  });
});

// Admin routes
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await User.find({ isActive: true })
    .select('-password')
    .sort('-createdAt');
  
  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users
    }
  });
});

exports.createUser = catchAsync(async (req, res, next) => {
  const newUser = await User.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: {
      user: newUser
    }
  });
});

exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

exports.updateUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false });
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});
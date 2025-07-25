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
  
  // Remove password from output
  user.password = undefined;
  
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

// Signup
exports.signup = catchAsync(async (req, res, next) => {
  const { email, password, firstName, lastName, role } = req.body;
  
  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already registered', 400));
  }
  
  // Create verification token
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto
    .createHash('sha256')
    .update(verifyToken)
    .digest('hex');
  
  // Create user
  const newUser = await User.create({
    email,
    password,
    firstName,
    lastName,
    role: role || 'recruiter',
    emailVerificationToken: hashedToken,
    emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  });
  
  // Send verification email
  await EmailService.sendWelcome(newUser);
  
  res.status(201).json({
    status: 'success',
    message: 'User registered successfully! Please check your email to verify your account.'
  });
});

// Login
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }
  
  // Check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
  
  // Check if account is locked
  if (user && user.isLocked) {
    return next(new AppError('Account locked due to too many failed login attempts', 423));
  }
  
  if (!user || !(await user.comparePassword(password))) {
    if (user) {
      // Increment login attempts
      user.loginAttempts += 1;
      
      // Lock account after 5 attempts
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
      }
      
      await user.save({ validateBeforeSave: false });
    }
    
    return next(new AppError('Incorrect email or password', 401));
  }
  
  // Check if email is verified
  if (!user.isEmailVerified) {
    return next(new AppError('Please verify your email before logging in', 401));
  }
  
  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated', 401));
  }
  
  // Reset login attempts
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });
  
  // If 2FA is enabled, require 2FA code
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
  // Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  
  if (!user) {
    return next(new AppError('There is no user with that email address.', 404));
  }
  
  // Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  
  // Send it to user's email
  try {
    const resetURL = `${process.env.APP_URL}/reset-password/${resetToken}`;
    await EmailService.sendPasswordReset(user, resetURL);
    
    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!'
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    
    return next(new AppError('There was an error sending the email. Please try again later.', 500));
  }
});

// Reset password
exports.resetPassword = catchAsync(async (req, res, next) => {
  // Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });
  
  // If token has not expired, and there is a user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  
  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  
  // Log the user in, send JWT
  createSendToken(user, 200, res);
});

// Update password
exports.updatePassword = catchAsync(async (req, res, next) => {
  // Get user from collection
  const user = await User.findById(req.user.id).select('+password');
  
  // Check if POSTed current password is correct
  if (!(await user.comparePassword(req.body.currentPassword))) {
    return next(new AppError('Your current password is incorrect.', 401));
  }
  
  // If so, update password
  user.password = req.body.newPassword;
  await user.save();
  
  // Log user in, send JWT
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
  // Create error if user POSTs password data
  if (req.body.password) {
    return next(new AppError('This route is not for password updates. Please use /update-password.', 400));
  }
  
  // Filtered out unwanted fields names that are not allowed to be updated
  const filteredBody = {};
  const allowedFields = ['firstName', 'lastName', 'email'];
  
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });
  
  // Update user document
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

// Verify email
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
    return next(new AppError('Token is invalid or has expired', 400));
  }
  
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });
  
  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully!'
  });
});

// Resend verification email
exports.resendVerification = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    return next(new AppError('Please provide an email address', 400));
  }
  
  const user = await User.findOne({ email });
  
  if (!user) {
    return next(new AppError('No user found with that email address', 404));
  }
  
  if (user.isEmailVerified) {
    return next(new AppError('Email is already verified', 400));
  }
  
  // Generate new verification token
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto
    .createHash('sha256')
    .update(verifyToken)
    .digest('hex');
  
  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await user.save({ validateBeforeSave: false });
  
  // Send verification email
  await EmailService.sendWelcome(user);
  
  res.status(200).json({
    status: 'success',
    message: 'Verification email sent successfully'
  });
});

// Enable 2FA
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

// Verify 2FA
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

// Disable 2FA
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

// Admin functions
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
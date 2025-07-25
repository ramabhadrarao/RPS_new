// middleware/auth.js
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const TokenService = require('../services/tokenService');

// Protect routes
exports.protect = catchAsync(async (req, res, next) => {
  // 1) Get token and check if it exists
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  
  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }
  
  // 2) Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  
  // 3) Check if token is blacklisted
  const isBlacklisted = await TokenService.isTokenBlacklisted(token);
  if (isBlacklisted) {
    return next(new AppError('Token has been invalidated. Please log in again.', 401));
  }
  
  // 4) Check if user still exists
  const currentUser = await User.findById(decoded.id).select('+isActive');
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }
  
  // 5) Check if user is active
  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 401));
  }
  
  // 6) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password. Please log in again.', 401));
  }
  
  // 7) Check if account is locked
  if (currentUser.isLocked) {
    return next(new AppError('Account is locked due to multiple failed login attempts.', 423));
  }
  
  // Grant access to protected route
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// Restrict to certain roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

// Check specific permissions
exports.checkPermission = (module, action) => {
  return (req, res, next) => {
    const hasPermission = req.user.permissions.some(
      perm => perm.module === module && perm.actions.includes(action)
    );
    
    if (!hasPermission && !['admin', 'super_admin'].includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    next();
  };
};

// Optional authentication - doesn't fail if no token
exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    try {
      // 1) Verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );
      
      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser || !currentUser.isActive) {
        return next();
      }
      
      // 3) Check if user changed password after token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }
      
      // There is a logged in user
      res.locals.user = currentUser;
      req.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

// Verify 2FA token
exports.verify2FA = catchAsync(async (req, res, next) => {
  if (!req.user.twoFactorEnabled) {
    return next();
  }
  
  const { twoFactorToken } = req.body;
  
  if (!twoFactorToken) {
    return next(new AppError('Please provide 2FA token', 400));
  }
  
  const isValid = await TokenService.verify2FAToken(req.user, twoFactorToken);
  
  if (!isValid) {
    return next(new AppError('Invalid 2FA token', 401));
  }
  
  next();
});
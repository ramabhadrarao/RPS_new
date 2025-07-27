// routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const { protect, restrictTo } = require('../middleware/auth');
const validation = require('../middleware/validation');
const { createRateLimiter } = require('../middleware/security');

const router = express.Router();

// Rate limiters
const authLimiter = createRateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
const emailLimiter = createRateLimiter(60 * 60 * 1000, 3); // 3 emails per hour

// ===== PUBLIC ROUTES =====

// Signup with async email
router.post('/signup', 
  authLimiter,
  validation.validateSignup, 
  authController.signup
);

// Login with grace period for unverified emails
router.post('/login', 
  authLimiter,
  validation.validateLogin, 
  authController.login
);

// Development quick login (skip all checks)
if (process.env.NODE_ENV === 'development') {
  router.post('/dev-login', authController.devLogin);
}

// Email verification routes
router.post('/verify-email/:token', authController.verifyEmail); // API endpoint
router.get('/verify-email-form/:token', authController.getVerifyEmailForm); // HTML form
router.post('/verify-email-submit', authController.submitEmailVerification); // Form submission

// Resend verification email
router.post('/resend-verification', 
  emailLimiter,
  authController.resendVerification
);

// Check verification status (for frontend)
router.get('/verification-status/:email', authController.checkVerificationStatus);

// Password reset
router.post('/forgot-password', 
  emailLimiter,
  authController.forgotPassword
);
router.get('/reset-password/:token', authController.getPasswordResetForm); // HTML form
router.post('/reset-password/:token', authController.resetPassword); // API endpoint

// ===== PROTECTED ROUTES =====
router.use(protect); // All routes after this are protected

// User profile
router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.patch('/update-me', authController.updateMe);
router.delete('/delete-me', authController.deleteMe);
router.patch('/update-password', authController.updatePassword);

// 2FA routes
router.post('/enable-2fa', authController.enable2FA);
router.post('/verify-2fa', authController.verify2FA);
router.post('/disable-2fa', authController.disable2FA);

// ===== ADMIN ROUTES =====
router.use(restrictTo('admin', 'super_admin'));

router.get('/users', authController.getAllUsers);
router.post('/users', authController.createUser);

router.route('/users/:id')
  .get(authController.getUser)
  .patch(authController.updateUser)
  .delete(authController.deleteUser);
router.post('/logout-all-devices', protect, authController.logoutAllDevices);
router.get('/sessions', protect, authController.getActiveSessions);
router.delete('/sessions/:sessionId', protect, authController.revokeSession);
module.exports = router;
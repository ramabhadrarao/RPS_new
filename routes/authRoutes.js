// routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const { protect, restrictTo } = require('../middleware/auth');
const validation = require('../middleware/validation');

const router = express.Router();

// Public routes
router.post('/signup', validation.validateSignup, authController.signup);
router.post('/login', validation.validateLogin, authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.post('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);

// Protected routes
router.use(protect); // All routes after this middleware are protected

router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.patch('/update-password', authController.updatePassword);
router.patch('/update-me', authController.updateMe);
router.delete('/delete-me', authController.deleteMe);

// 2FA routes
router.post('/enable-2fa', authController.enable2FA);
router.post('/verify-2fa', authController.verify2FA);
router.post('/disable-2fa', authController.disable2FA);

// Admin only routes
router.use(restrictTo('admin', 'super_admin'));

router.get('/users', authController.getAllUsers);
router.post('/users', authController.createUser);
router.get('/users/:id', authController.getUser);
router.patch('/users/:id', authController.updateUser);
router.delete('/users/:id', authController.deleteUser);

module.exports = router;
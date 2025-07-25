// middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('../utils/appError');

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg
    }));
    
    return next(new AppError('Validation failed', 400, errorMessages));
  }
  
  next();
};

// User validations
exports.validateSignup = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isAlpha()
    .withMessage('First name must contain only letters'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isAlpha()
    .withMessage('Last name must contain only letters'),
  body('role')
    .optional()
    .isIn(['recruiter', 'hr', 'client', 'vendor'])
    .withMessage('Invalid role'),
  handleValidationErrors
];

exports.validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Client validations
exports.validateClient = [
  body('businessType')
    .isIn(['Contract', 'Permanent', 'RPO'])
    .withMessage('Invalid business type'),
  body('businessDetails.clientName')
    .trim()
    .notEmpty()
    .withMessage('Client name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be between 2 and 100 characters'),
  body('businessDetails.industry')
    .notEmpty()
    .withMessage('Industry is required'),
  body('addressDetails.primaryAddress')
    .notEmpty()
    .withMessage('Primary address is required'),
  body('addressDetails.billingAddress')
    .notEmpty()
    .withMessage('Billing address is required'),
  body('billingInfo.gstNumber')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Invalid GST number format'),
  handleValidationErrors
];

// Candidate validations
exports.validateCandidate = [
  body('step')
    .isIn(['personal', 'education', 'employment', 'kyc', 'financial', 'recruiterCall'])
    .withMessage('Invalid step'),
  
  // Personal details validation
  body('data.personalDetails.firstName')
    .if(body('step').equals('personal'))
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('data.personalDetails.lastName')
    .if(body('step').equals('personal'))
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('data.contactInfo.email')
    .if(body('step').equals('personal'))
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('data.contactInfo.phoneNo')
    .if(body('step').equals('personal'))
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid 10-digit phone number is required'),
  
  // KYC validation
  body('data.kyc.aadhaarNumber')
    .if(body('step').equals('kyc'))
    .matches(/^\d{12}$/)
    .withMessage('Aadhaar number must be 12 digits'),
  body('data.kyc.panNumber')
    .if(body('step').equals('kyc'))
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .withMessage('Invalid PAN number format'),
    
  handleValidationErrors
];

// Requirement validations
exports.validateRequirement = [
  body('jobTitle')
    .trim()
    .notEmpty()
    .withMessage('Job title is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Job title must be between 3 and 100 characters'),
  body('employmentType')
    .isIn(['fullTime', 'contract', 'temporary'])
    .withMessage('Invalid employment type'),
  body('clientId')
    .isMongoId()
    .withMessage('Valid client ID is required'),
  body('jobLocation')
    .notEmpty()
    .withMessage('Job location is required'),
  body('workExpMin')
    .isInt({ min: 0 })
    .withMessage('Minimum experience must be a positive number'),
  body('workExpMax')
    .isInt({ min: 0 })
    .withMessage('Maximum experience must be a positive number')
    .custom((value, { req }) => value >= req.body.workExpMin)
    .withMessage('Maximum experience must be greater than minimum'),
  body('jobDescription')
    .trim()
    .notEmpty()
    .withMessage('Job description is required')
    .isLength({ min: 50 })
    .withMessage('Job description must be at least 50 characters'),
  handleValidationErrors
];

// SPOC validations
exports.validateSpoc = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('SPOC name is required'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('mobile')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid mobile number is required'),
  body('status')
    .isIn(['Active', 'Inactive'])
    .withMessage('Invalid status'),
  body('functionalRoles')
    .isArray({ min: 1 })
    .withMessage('At least one functional role is required'),
  handleValidationErrors
];

// Status update validation
exports.validateStatusUpdate = [
  body('status')
    .isIn(['New', 'Screening', 'Submitted', 'Interview', 'Selected', 'Offered', 'Joined', 'Rejected', 'On Hold'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters'),
  handleValidationErrors
];

// MongoDB ID validation
exports.validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  handleValidationErrors
];

// Pagination validation
exports.validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sort')
    .optional()
    .matches(/^-?(createdAt|updatedAt|name|email|status)$/)
    .withMessage('Invalid sort field'),
  handleValidationErrors
];

// Custom validators
exports.isValidIndianMobile = (value) => {
  return /^[6-9]\d{9}$/.test(value);
};

exports.isValidGST = (value) => {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value);
};

exports.isValidPAN = (value) => {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value);
};

exports.isValidAadhaar = (value) => {
  return /^\d{12}$/.test(value);
};
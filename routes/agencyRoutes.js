// routes/agencyRoutes.js
const express = require('express');
const agencyController = require('../controllers/agencyController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadFields } = require('../middleware/upload');

const router = express.Router();

// Public route for agency registration
router.post('/register',
  uploadFields([
    { name: 'panCard', maxCount: 1 },
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'cancelledCheque', maxCount: 1 },
    { name: 'companyRegistration', maxCount: 1 },
    { name: 'signedNDA', maxCount: 1 },
    { name: 'bankDetailsLetter', maxCount: 1 },
    { name: 'digitalSignature', maxCount: 1 }
  ]),
  agencyController.registerAgency
);

// Protected routes
router.use(protect);

// Agency management
router
  .route('/')
  .get(
    restrictTo('admin', 'super_admin', 'hr'),
    agencyController.getAgencies
  );

router
  .route('/:id')
  .get(agencyController.getAgency)
  .patch(
    restrictTo('admin', 'super_admin', 'hr'),
    uploadFields([
      { name: 'documents', maxCount: 10 }
    ]),
    agencyController.updateAgency
  )
  .delete(
    restrictTo('admin', 'super_admin'),
    agencyController.deleteAgency
  );

// Verification
router.patch('/:id/verify',
  restrictTo('admin', 'super_admin'),
  agencyController.verifyAgency
);

// Status management
router.patch('/:id/status',
  restrictTo('admin', 'super_admin', 'hr'),
  agencyController.updateAgencyStatus
);

// Performance metrics
router.get('/:id/performance',
  restrictTo('admin', 'super_admin', 'hr'),
  agencyController.getAgencyPerformance
);

// Freelancer routes
router.post('/freelancer/register',
  uploadFields([
    { name: 'panCard', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'certifications', maxCount: 5 },
    { name: 'signedNDA', maxCount: 1 },
    { name: 'signature', maxCount: 1 }
  ]),
  agencyController.registerFreelancer
);

router.get('/freelancers',
  restrictTo('admin', 'super_admin', 'hr'),
  agencyController.getFreelancers
);

module.exports = router;
// routes/candidateRoutes.js
const express = require('express');
const candidateController = require('../controllers/candidateController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadFields } = require('../middleware/upload');
const validation = require('../middleware/validation');

const router = express.Router();

// All routes are protected
router.use(protect);

// Candidate operations
router
  .route('/')
  .get(candidateController.getCandidates)
  .post(
    uploadFields([
      { name: 'passportImage', maxCount: 1 },
      { name: 'certificates', maxCount: 10 },
      { name: 'documents', maxCount: 20 }
    ]),
    validation.validateCandidate,
    candidateController.upsertCandidate
  );

// Multi-step form endpoint
router.post('/step',
  uploadFields([
    { name: 'passportImage', maxCount: 1 },
    { name: 'certificate_0', maxCount: 1 },
    { name: 'certificate_1', maxCount: 1 },
    { name: 'certificate_2', maxCount: 1 },
    { name: 'certificate_3', maxCount: 1 },
    { name: 'certificate_4', maxCount: 1 },
    { name: 'aadhaar', maxCount: 1 },
    { name: 'pan', maxCount: 1 },
    { name: 'panSelfie', maxCount: 1 },
    { name: 'passport', maxCount: 1 },
    { name: 'bankDoc', maxCount: 1 }
  ]),
  candidateController.upsertCandidate
);

// Search candidates
router.get('/search', candidateController.searchCandidates);

// Export candidates
router.get('/export', 
  restrictTo('admin', 'super_admin', 'hr'),
  candidateController.exportCandidates
);

router
  .route('/:id')
  .get(candidateController.getCandidate)
  .patch(
    uploadFields([
      { name: 'documents', maxCount: 10 }
    ]),
    candidateController.upsertCandidate
  );

// Status management
router.patch('/:id/status',
  restrictTo('admin', 'super_admin', 'hr', 'recruiter'),
  validation.validateStatusUpdate,
  candidateController.updateCandidateStatus
);

// Assignment
router.patch('/:id/assign',
  restrictTo('admin', 'super_admin', 'hr'),
  candidateController.assignCandidate
);

// Notes
router.post('/:id/notes',
  candidateController.addNote
);

module.exports = router;
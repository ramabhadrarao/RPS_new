// routes/requirementRoutes.js
const express = require('express');
const requirementController = require('../controllers/requirementController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadFields } = require('../middleware/upload');
const validation = require('../middleware/validation');

const router = express.Router();

// All routes are protected
router.use(protect);

// Requirement CRUD operations
router
  .route('/')
  .get(requirementController.getRequirements)
  .post(
    restrictTo('admin', 'super_admin', 'hr', 'recruiter'),
    validation.validateRequirement,
    requirementController.createRequirement
  );

// Bulk operations
router.post('/bulk-create',
  restrictTo('admin', 'super_admin'),
  requirementController.bulkCreateRequirements
);

// Search and filter
router.get('/search', requirementController.searchRequirements);

// Statistics
router.get('/stats', 
  restrictTo('admin', 'super_admin', 'hr'),
  requirementController.getRequirementStats
);

// Single requirement operations
router
  .route('/:id')
  .get(requirementController.getRequirement)
  .patch(
    restrictTo('admin', 'super_admin', 'hr'),
    requirementController.updateRequirement
  )
  .delete(
    restrictTo('admin', 'super_admin'),
    requirementController.deleteRequirement
  );

// Allocation
router.post('/:id/allocate',
  restrictTo('admin', 'super_admin', 'hr'),
  requirementController.allocateRequirement
);

// Status management
router.patch('/:id/status',
  restrictTo('admin', 'super_admin', 'hr'),
  requirementController.updateRequirementStatus
);

// Candidate mapping
router.post('/:id/candidates/:candidateId',
  requirementController.mapCandidateToRequirement
);

// Clone requirement
router.post('/:id/clone',
  restrictTo('admin', 'super_admin', 'hr'),
  requirementController.cloneRequirement
);

module.exports = router;
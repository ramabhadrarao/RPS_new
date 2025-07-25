// routes/workflowRoutes.js
const express = require('express');
const workflowController = require('../controllers/workflowController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// Workflow status
router.get('/:entityType/:entityId/status',
  workflowController.getWorkflowStatus
);

// Update workflow stage
router.patch('/:entityType/:entityId/stage',
  workflowController.updateWorkflowStage
);

// Validate stage
router.post('/:entityType/:entityId/validate',
  workflowController.validateStage
);

// Reports
router.get('/reports/pipeline',
  restrictTo('admin', 'super_admin', 'hr'),
  workflowController.getPipelineReport
);

router.post('/reports/generate',
  restrictTo('admin', 'super_admin', 'hr'),
  workflowController.generateReport
);

// Export data
router.get('/export/:type',
  restrictTo('admin', 'super_admin', 'hr'),
  workflowController.exportData
);

module.exports = router;
// routes/recruiterRoutes.js
const express = require('express');
const recruiterController = require('../controllers/recruiterController');
const { protect, restrictTo } = require('../middleware/auth');
const validation = require('../middleware/validation');

const router = express.Router();

// All routes are protected
router.use(protect);

// Recruiter workflow
router.post('/call-form',
  recruiterController.saveRecruiterCall
);

router.post('/selection',
  recruiterController.createSelection
);

// Dashboard and analytics
router.get('/dashboard',
  recruiterController.getRecruiterDashboard
);

router.get('/performance',
  recruiterController.getPerformanceMetrics
);

// My candidates
router.get('/candidates',
  recruiterController.getMyCandidates
);

// My requirements
router.get('/requirements',
  recruiterController.getMyRequirements
);

// Activity tracking
router.get('/activities',
  recruiterController.getActivities
);

router.post('/activities',
  recruiterController.logActivity
);

// Team management (for team leads)
router.get('/team',
  restrictTo('team_lead', 'admin', 'super_admin'),
  recruiterController.getTeamMembers
);

router.get('/team/performance',
  restrictTo('team_lead', 'admin', 'super_admin'),
  recruiterController.getTeamPerformance
);

module.exports = router;
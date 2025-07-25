// routes/clientRoutes.js
const express = require('express');
const clientController = require('../controllers/clientController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadFields, uploadSingle } = require('../middleware/upload');
const validation = require('../middleware/validation');

const router = express.Router();

// All routes are protected
router.use(protect);

// Client CRUD operations
router
  .route('/')
  .get(clientController.getClients)
  .post(
    restrictTo('admin', 'super_admin', 'hr'),
    uploadFields([
      { name: 'candidate_docs', maxCount: 10 },
      { name: 'client_docs', maxCount: 10 },
      { name: 'blocklisted_companies', maxCount: 1 },
      { name: 'blocklisted_universities', maxCount: 1 }
    ]),
    validation.validateClient,
    clientController.createClient
  );

// Statistics route - must come before /:id to avoid conflicts
router.get('/stats/overview', 
  restrictTo('admin', 'super_admin'),
  clientController.getClientStats
);

router
  .route('/:id')
  .get(clientController.getClient)
  .patch(
    restrictTo('admin', 'super_admin', 'hr'),
    uploadFields([
      { name: 'candidate_docs', maxCount: 10 },
      { name: 'client_docs', maxCount: 10 }
    ]),
    clientController.updateClient
  )
  .delete(
    restrictTo('admin', 'super_admin'),
    clientController.deleteClient
  );

// SPOC management
router
  .route('/:id/spoc')
  .post(
    restrictTo('admin', 'super_admin', 'hr'),
    validation.validateSpoc,
    clientController.addSpoc
  );

router
  .route('/:id/spoc/:spocId')
  .patch(
    restrictTo('admin', 'super_admin', 'hr'),
    clientController.updateSpoc
  )
  .delete(
    restrictTo('admin', 'super_admin', 'hr'),
    clientController.removeSpoc
  );

// Blocklist management endpoints
router
  .route('/:id/blocklist/companies')
  .get(
    restrictTo('admin', 'super_admin', 'hr'),
    clientController.getBlocklistedCompanies
  )
  .post(
    restrictTo('admin', 'super_admin', 'hr'),
    uploadSingle('file'),
    clientController.uploadBlocklistedCompanies
  )
  .delete(
    restrictTo('admin', 'super_admin', 'hr'),
    clientController.clearBlocklistedCompanies
  );

router
  .route('/:id/blocklist/universities')
  .get(
    restrictTo('admin', 'super_admin', 'hr'),
    clientController.getBlocklistedUniversities
  )
  .post(
    restrictTo('admin', 'super_admin', 'hr'),
    uploadSingle('file'),
    clientController.uploadBlocklistedUniversities
  )
  .delete(
    restrictTo('admin', 'super_admin', 'hr'),
    clientController.clearBlocklistedUniversities
  );

module.exports = router;
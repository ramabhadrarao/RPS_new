// routes/bgvVendorRoutes.js
const express = require('express');
const bgvVendorController = require('../controllers/bgvVendorController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadFields } = require('../middleware/upload');
const validation = require('../middleware/validation');

const router = express.Router();

// All routes are protected
router.use(protect);

// BGV Vendor CRUD operations
router
  .route('/')
  .get(bgvVendorController.getVendors)
  .post(
    restrictTo('admin', 'super_admin', 'hr'),
    uploadFields([
      { name: 'documents', maxCount: 10 }
    ]),
    bgvVendorController.createVendor
  );

router
  .route('/:id')
  .get(bgvVendorController.getVendor)
  .patch(
    restrictTo('admin', 'super_admin', 'hr'),
    uploadFields([
      { name: 'documents', maxCount: 10 }
    ]),
    bgvVendorController.updateVendor
  )
  .delete(
    restrictTo('admin', 'super_admin'),
    bgvVendorController.deleteVendor
  );

// SPOC management
router
  .route('/:id/spoc')
  .post(
    restrictTo('admin', 'super_admin', 'hr'),
    bgvVendorController.addSpoc
  );

router
  .route('/:id/spoc/:spocId')
  .patch(
    restrictTo('admin', 'super_admin', 'hr'),
    bgvVendorController.updateSpoc
  )
  .delete(
    restrictTo('admin', 'super_admin', 'hr'),
    bgvVendorController.removeSpoc
  );

// Document management
router
  .route('/:id/documents')
  .post(
    restrictTo('admin', 'super_admin', 'hr'),
    uploadFields([
      { name: 'document', maxCount: 1 }
    ]),
    bgvVendorController.addDocument
  );

router.delete('/:id/documents/:documentId',
  restrictTo('admin', 'super_admin', 'hr'),
  bgvVendorController.removeDocument
);

module.exports = router;
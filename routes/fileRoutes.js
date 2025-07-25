// routes/fileRoutes.js
const express = require('express');
const fileController = require('../controllers/fileController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

// All routes are protected
router.use(protect);

// File operations
router.get('/:id',
  fileController.getFile
);

router.delete('/:id',
  fileController.deleteFile
);

// Verify document
router.patch('/:id/verify',
  restrictTo('admin', 'super_admin', 'hr'),
  fileController.verifyDocument
);

// Bulk operations
router.post('/bulk-verify',
  restrictTo('admin', 'super_admin', 'hr'),
  fileController.bulkVerifyDocuments
);

// Get entity documents
router.get('/entity/:entityType/:entityId',
  fileController.getEntityDocuments
);

module.exports = router;
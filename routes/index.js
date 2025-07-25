// routes/index.js
const express = require('express');
const authRoutes = require('./authRoutes');
const clientRoutes = require('./clientRoutes');
const candidateRoutes = require('./candidateRoutes');
const requirementRoutes = require('./requirementRoutes');
const bgvVendorRoutes = require('./bgvVendorRoutes');
const recruiterRoutes = require('./recruiterRoutes');
const agencyRoutes = require('./agencyRoutes');
const fileRoutes = require('./fileRoutes');
const workflowRoutes = require('./workflowRoutes');

const router = express.Router();

// API versioning
const v1 = '/api/v1';

router.use(`${v1}/auth`, authRoutes);
router.use(`${v1}/clients`, clientRoutes);
router.use(`${v1}/candidates`, candidateRoutes);
router.use(`${v1}/requirements`, requirementRoutes);
router.use(`${v1}/bgv-vendors`, bgvVendorRoutes);
router.use(`${v1}/recruiters`, recruiterRoutes);
router.use(`${v1}/agencies`, agencyRoutes);
router.use(`${v1}/files`, fileRoutes);
router.use(`${v1}/workflows`, workflowRoutes);

// Health check
router.get(`${v1}/health`, (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'ATS API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
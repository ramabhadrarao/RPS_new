// routes/jobPostingRoutes.js
const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const validation = require('../middleware/validation');

const router = express.Router();

router.use(protect);

// Job posting is essentially a requirement with additional fields
router.post('/post',
  restrictTo('admin', 'super_admin', 'hr', 'client'),
  validation.validateRequirement,
  async (req, res, next) => {
    try {
      // Transform job posting data to requirement format
      const requirementData = {
        ...req.body,
        status: 'Active',
        publishedAt: new Date(),
        isJobPosting: true // Flag to identify job postings
      };
      
      const requirement = await Requirement.create(requirementData);
      
      res.status(201).json({
        status: 'success',
        data: { requirement }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
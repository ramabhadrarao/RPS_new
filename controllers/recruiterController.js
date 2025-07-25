// controllers/recruiterController.js
const Candidate = require('../models/Candidate');
const Requirement = require('../models/Requirement');
const User = require('../models/User');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

class RecruiterController {
  // Save recruiter call form
  saveRecruiterCall = catchAsync(async (req, res, next) => {
    const { candidateId, callData } = req.body;
    
    let candidate;
    
    if (candidateId) {
      candidate = await Candidate.findById(candidateId);
      if (!candidate) {
        return next(new AppError('Candidate not found', 404));
      }
    } else {
      // Create new candidate with basic info
      candidate = new Candidate({
        personalDetails: {
          firstName: callData.candidateName.split(' ')[0],
          lastName: callData.candidateName.split(' ').slice(1).join(' ')
        },
        contactInfo: {
          phoneNo: callData.contactNumber,
          email: callData.email
        },
        createdBy: req.user._id
      });
    }
    
    // Update recruiter call data
    candidate.recruiterCallData = {
      ...candidate.recruiterCallData,
      ...callData,
      callDate: new Date(),
      calledBy: req.user._id
    };
    
    // Update status based on response
    if (callData.candidateResponse === 'Yes') {
      candidate.status = 'Screening';
    } else if (callData.candidateResponse === 'No') {
      candidate.status = 'Rejected';
    }
    
    await candidate.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        candidate
      }
    });
  });
  
  // Create selection record
  createSelection = catchAsync(async (req, res, next) => {
    const {
      candidateId,
      requirementId,
      businessType,
      client,
      prevCompany,
      offeredDesignation,
      offeredSalary,
      expectedJoiningDate
    } = req.body;
    
    // Update candidate status
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return next(new AppError('Candidate not found', 404));
    }
    
    candidate.status = 'Selected';
    candidate.selectionDetails = {
      businessType,
      client,
      offeredDesignation,
      offeredSalary,
      expectedJoiningDate,
      selectionDate: new Date()
    };
    
    await candidate.save();
    
    // Update requirement metrics
    if (requirementId) {
      await Requirement.findByIdAndUpdate(requirementId, {
        $inc: { 'metrics.selected': 1 }
      });
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        candidate
      }
    });
  });
  
  // Get recruiter dashboard
  getRecruiterDashboard = catchAsync(async (req, res, next) => {
    const userId = req.user._id;
    
    // Get statistics
    const stats = await Candidate.aggregate([
      {
        $match: {
          $or: [
            { createdBy: userId },
            { assignedTo: userId }
          ]
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get recent activities
    const recentCandidates = await Candidate
      .find({
        $or: [
          { createdBy: userId },
          { assignedTo: userId }
        ]
      })
      .select('personalDetails status createdAt')
      .sort('-createdAt')
      .limit(10);
    
    // Get assigned requirements
    const assignedRequirements = await Requirement
      .find({
        $or: [
          { 'allocation.recruiters.recruiterId': userId },
          { 'allocation.all': true }
        ],
        status: 'Active'
      })
      .select('jobTitle vacancyCount filledCount')
      .limit(10);
    
    res.status(200).json({
      status: 'success',
      data: {
        statistics: stats,
        recentCandidates,
        assignedRequirements
      }
    });
  });
  
  // Get performance metrics
  getPerformanceMetrics = catchAsync(async (req, res, next) => {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const metrics = await Candidate.aggregate([
      {
        $match: {
          createdBy: userId,
          ...(dateFilter && { createdAt: dateFilter })
        }
      },
      {
        $group: {
          _id: null,
          totalCandidates: { $sum: 1 },
          submitted: {
            $sum: { $cond: [{ $eq: ['$status', 'Submitted'] }, 1, 0] }
          },
          selected: {
            $sum: { $cond: [{ $eq: ['$status', 'Selected'] }, 1, 0] }
          },
          joined: {
            $sum: { $cond: [{ $eq: ['$status', 'Joined'] }, 1, 0] }
          }
        }
      }
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        metrics: metrics[0] || {
          totalCandidates: 0,
          submitted: 0,
          selected: 0,
          joined: 0
        }
      }
    });
  });
  
  // Get my candidates
  getMyCandidates = catchAsync(async (req, res, next) => {
    const candidates = await Candidate
      .find({
        $or: [
          { createdBy: req.user._id },
          { assignedTo: req.user._id }
        ]
      })
      .populate('assignedTo', 'firstName lastName')
      .sort('-createdAt');
    
    res.status(200).json({
      status: 'success',
      results: candidates.length,
      data: {
        candidates
      }
    });
  });
  
  // Get my requirements
  getMyRequirements = catchAsync(async (req, res, next) => {
    const requirements = await Requirement
      .find({
        $or: [
          { 'allocation.recruiters.recruiterId': req.user._id },
          { 'allocation.all': true },
          { createdBy: req.user._id }
        ],
        status: 'Active'
      })
      .populate('clientId', 'businessDetails.clientName')
      .sort('-createdAt');
    
    res.status(200).json({
      status: 'success',
      results: requirements.length,
      data: {
        requirements
      }
    });
  });
  
  // Get activities
  getActivities = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 20 } = req.query;
    
    // This would typically come from an Activity model
    // For now, returning a placeholder
    res.status(200).json({
      status: 'success',
      data: {
        activities: []
      }
    });
  });
  
  // Log activity
  logActivity = catchAsync(async (req, res, next) => {
    const { type, description, entityType, entityId } = req.body;
    
    // This would typically create an activity record
    // For now, returning success
    res.status(201).json({
      status: 'success',
      data: {
        activity: {
          type,
          description,
          entityType,
          entityId,
          createdBy: req.user._id,
          createdAt: new Date()
        }
      }
    });
  });
  
  // Get team members
  getTeamMembers = catchAsync(async (req, res, next) => {
    // This would typically fetch from a Team model
    const teamMembers = await User
      .find({
        role: 'recruiter',
        isActive: true
      })
      .select('firstName lastName email role');
    
    res.status(200).json({
      status: 'success',
      results: teamMembers.length,
      data: {
        teamMembers
      }
    });
  });
  
  // Get team performance
  getTeamPerformance = catchAsync(async (req, res, next) => {
    // Aggregate team performance metrics
    const teamPerformance = await Candidate.aggregate([
      {
        $match: {
          createdBy: { $in: req.body.teamMemberIds || [] }
        }
      },
      {
        $group: {
          _id: '$createdBy',
          totalCandidates: { $sum: 1 },
          submitted: {
            $sum: { $cond: [{ $eq: ['$status', 'Submitted'] }, 1, 0] }
          },
          selected: {
            $sum: { $cond: [{ $eq: ['$status', 'Selected'] }, 1, 0] }
          }
        }
      }
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        teamPerformance
      }
    });
  });
}

module.exports = new RecruiterController();
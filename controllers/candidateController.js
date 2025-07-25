// controllers/candidateController.js
const Candidate = require('../models/Candidate');
const FileService = require('../services/fileService');
const EmailService = require('../services/emailService');
const WorkflowService = require('../services/workflowService');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

class CandidateController {
  // Create/Update candidate (multi-step form)
  upsertCandidate = catchAsync(async (req, res, next) => {
    const { candidateId, step, data } = req.body;
    
    let candidate;
    
    if (candidateId) {
      // Update existing candidate
      candidate = await Candidate.findById(candidateId);
      
      if (!candidate) {
        return next(new AppError('No candidate found with that ID', 404));
      }
      
      // Check permissions
      if (candidate.createdBy.toString() !== req.user._id.toString() && 
          req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return next(new AppError('You do not have permission to update this candidate', 403));
      }
    } else {
      // Create new candidate
      candidate = new Candidate({
        createdBy: req.user._id
      });
    }
    
    // Update based on step
    switch (step) {
      case 'personal':
        candidate.personalDetails = data.personalDetails;
        candidate.contactInfo = data.contactInfo;
        candidate.emergencyContact = data.emergencyContact;
        
        // Handle passport image upload
        if (req.files?.passportImage) {
          const uploadedFile = await FileService.uploadSingle(
            req.files.passportImage[0],
            'Candidate',
            candidate._id,
            req.user._id,
            'photo'
          );
          candidate.personalDetails.passportImageId = uploadedFile._id;
        }
        
        candidate.workflowStage = 'Education';
        break;
        
      case 'education':
        candidate.education = data.education;
        
        // Handle certificate uploads
        if (req.files) {
          for (let i = 0; i < candidate.education.length; i++) {
            const fileKey = `certificate_${i}`;
            if (req.files[fileKey]) {
              const uploadedFile = await FileService.uploadSingle(
                req.files[fileKey][0],
                'Candidate',
                candidate._id,
                req.user._id,
                'education_certificate'
              );
              candidate.education[i].certificateId = uploadedFile._id;
            }
          }
        }
        
        candidate.workflowStage = 'Employment';
        break;
        
      case 'employment':
        candidate.employment = data.employment;
        candidate.offerStatus = data.offerStatus;
        
        // Handle document uploads
        // Similar pattern for employment documents
        
        candidate.workflowStage = 'KYC';
        break;
        
      case 'kyc':
        candidate.kyc = data.kyc;
        candidate.bankDetails = data.bankDetails;
        candidate.address = data.address;
        
        // Handle KYC document uploads
        // Similar pattern for KYC documents
        
        candidate.workflowStage = 'Financial';
        break;
        
      case 'financial':
        candidate.financialInfo = data.financialInfo;
        
        // Calculate financial metrics
        candidate.financialInfo.calculated = WorkflowService.calculateFinancialMetrics(
          data.financialInfo
        );
        
        candidate.workflowStage = 'Review';
        break;
        
      case 'recruiterCall':
        candidate.recruiterCallData = data;
        break;
        
      default:
        return next(new AppError('Invalid step provided', 400));
    }
    
    candidate.lastUpdatedBy = req.user._id;
    await candidate.save();
    
    // Send notification if moving to review stage
    if (candidate.workflowStage === 'Review' && step === 'financial') {
      await EmailService.sendCandidateReviewNotification(candidate);
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        candidate,
        nextStep: WorkflowService.getNextStep(candidate.workflowStage)
      }
    });
  });
  
  // Get all candidates
  getCandidates = catchAsync(async (req, res, next) => {
    const {
      status,
      workflowStage,
      search,
      assignedTo,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      sort = '-createdAt'
    } = req.query;
    
    // Build query
    const query = { isActive: true };
    
    if (status) query.status = status;
    if (workflowStage) query.workflowStage = workflowStage;
    if (assignedTo) query.assignedTo = assignedTo;
    
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    
    if (search) {
      query.$or = [
        { 'personalDetails.firstName': new RegExp(search, 'i') },
        { 'personalDetails.lastName': new RegExp(search, 'i') },
        { 'contactInfo.email': new RegExp(search, 'i') },
        { 'contactInfo.phoneNo': new RegExp(search, 'i') }
      ];
    }
    
    // Apply role-based filtering
    if (req.user.role === 'recruiter') {
      query.$or = [
        { createdBy: req.user._id },
        { assignedTo: req.user._id }
      ];
    }
    
    const candidates = await Candidate
      .find(query)
      .select('personalDetails contactInfo status workflowStage createdAt')
      .populate('createdBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Candidate.countDocuments(query);
    
    res.status(200).json({
      status: 'success',
      results: candidates.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        candidates
      }
    });
  });
  
  // Get single candidate
  getCandidate = catchAsync(async (req, res, next) => {
    const candidate = await Candidate
      .findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('personalDetails.passportImageId')
      .populate('education.certificateId')
      .populate('kyc.aadhaarFileId')
      .populate('kyc.panFileId');
    
    if (!candidate) {
      return next(new AppError('No candidate found with that ID', 404));
    }
    
    // Check permissions
    if (req.user.role === 'recruiter' && 
        candidate.createdBy.toString() !== req.user._id.toString() &&
        candidate.assignedTo?.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to view this candidate', 403));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        candidate
      }
    });
  });
  
  // Update candidate status
  updateCandidateStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const candidate = await Candidate.findById(id);
    
    if (!candidate) {
      return next(new AppError('No candidate found with that ID', 404));
    }
    
    // Validate status transition
    const validTransitions = {
      'New': ['Screening', 'Rejected'],
      'Screening': ['Submitted', 'Rejected', 'On Hold'],
      'Submitted': ['Interview', 'Rejected', 'On Hold'],
      'Interview': ['Selected', 'Rejected', 'On Hold'],
      'Selected': ['Offered', 'Rejected'],
      'Offered': ['Joined', 'Rejected'],
      'On Hold': ['Screening', 'Submitted', 'Interview', 'Rejected']
    };
    
    if (!validTransitions[candidate.status]?.includes(status)) {
      return next(new AppError(`Cannot transition from ${candidate.status} to ${status}`, 400));
    }
    
    candidate.status = status;
    candidate.lastUpdatedBy = req.user._id;
    
    if (notes) {
      candidate.notes.push({
        text: notes,
        createdBy: req.user._id
      });
    }
    
    await candidate.save();
    
    // Send status update notification
    await EmailService.sendCandidateStatusUpdate(candidate);
    
    res.status(200).json({
      status: 'success',
      data: {
        candidate
      }
    });
  });
  
  // Assign candidate
  assignCandidate = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { assignTo } = req.body;
    
    const candidate = await Candidate.findByIdAndUpdate(
      id,
      {
        assignedTo: assignTo,
        lastUpdatedBy: req.user._id
      },
      { new: true }
    );
    
    if (!candidate) {
      return next(new AppError('No candidate found with that ID', 404));
    }
    
    // Send assignment notification
    await EmailService.sendCandidateAssignment(candidate, assignTo);
    
    res.status(200).json({
      status: 'success',
      data: {
        candidate
      }
    });
  });
  
  // Add note to candidate
  addNote = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { text } = req.body;
    
    const candidate = await Candidate.findById(id);
    
    if (!candidate) {
      return next(new AppError('No candidate found with that ID', 404));
    }
    
    candidate.notes.push({
      text,
      createdBy: req.user._id
    });
    
    await candidate.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        note: candidate.notes[candidate.notes.length - 1]
      }
    });
  });
  
  // Search candidates
  searchCandidates = catchAsync(async (req, res, next) => {
    const { 
      skills, 
      experience, 
      location, 
      expectedSalary,
      availability
    } = req.query;
    
    const query = { isActive: true, status: { $in: ['New', 'Screening'] } };
    
    if (skills) {
      const skillArray = skills.split(',').map(s => s.trim());
      query['keySkills.name'] = { $in: skillArray };
    }
    
    if (experience) {
      query['recruiterCallData.totalExperience'] = { 
        $gte: parseInt(experience.min || 0),
        $lte: parseInt(experience.max || 100)
      };
    }
    
    if (location) {
      query.$or = [
        { 'recruiterCallData.currentCity': new RegExp(location, 'i') },
        { 'recruiterCallData.jobLocation': new RegExp(location, 'i') }
      ];
    }
    
    if (expectedSalary) {
      query['recruiterCallData.salaryDetails.expectedCTC'] = {
        $lte: parseInt(expectedSalary)
      };
    }
    
    if (availability) {
      const date = new Date();
      date.setDate(date.getDate() + parseInt(availability));
      query['employment.expectedJoiningDate'] = { $lte: date };
    }
    
    const candidates = await Candidate
      .find(query)
      .select('personalDetails contactInfo recruiterCallData status')
      .populate('assignedTo', 'firstName lastName')
      .limit(50);
    
    res.status(200).json({
      status: 'success',
      results: candidates.length,
      data: {
        candidates
      }
    });
  });
  
  // Export candidates
  exportCandidates = catchAsync(async (req, res, next) => {
    const { format = 'csv', ...filters } = req.query;
    
    // Use same query building as getCandidates
    const query = { isActive: true };
    // ... apply filters
    
    const candidates = await Candidate.find(query);
    
    let exportData;
    if (format === 'csv') {
      exportData = await WorkflowService.exportToCsv(candidates, 'candidate');
    } else if (format === 'excel') {
      exportData = await WorkflowService.exportToExcel(candidates, 'candidate');
    } else {
      return next(new AppError('Invalid export format', 400));
    }
    
    res.setHeader('Content-Type', exportData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename=candidates_${Date.now()}.${format}`);
    res.send(exportData.buffer);
  });
}

module.exports = new CandidateController();
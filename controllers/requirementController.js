// controllers/requirementController.js
const Requirement = require('../models/Requirement');
const Client = require('../models/Client');
const EmailService = require('../services/emailService');
const WorkflowService = require('../services/workflowService');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

class RequirementController {
  // Create new requirement
  createRequirement = catchAsync(async (req, res, next) => {
    // Verify client exists
    const client = await Client.findById(req.body.clientId);
    if (!client) {
      return next(new AppError('Client not found', 404));
    }
    
    // Create requirement
    const requirement = await Requirement.create({
      ...req.body,
      createdBy: req.user._id,
      status: 'Draft'
    });
    
    res.status(201).json({
      status: 'success',
      data: {
        requirement
      }
    });
  });
  
  // Get all requirements
  getRequirements = catchAsync(async (req, res, next) => {
    const {
      status,
      clientId,
      employmentType,
      search,
      minSalary,
      maxSalary,
      location,
      page = 1,
      limit = 20,
      sort = '-createdAt'
    } = req.query;
    
    // Build query
    const query = { isActive: true };
    
    if (status) query.status = status;
    if (clientId) query.clientId = clientId;
    if (employmentType) query.employmentType = employmentType;
    if (location) query.jobLocation = new RegExp(location, 'i');
    
    if (minSalary || maxSalary) {
      query.salaryMax = {};
      if (minSalary) query.salaryMax.$gte = parseInt(minSalary);
      if (maxSalary) query.salaryMin = { $lte: parseInt(maxSalary) };
    }
    
    if (search) {
      query.$or = [
        { jobTitle: new RegExp(search, 'i') },
        { jobDescription: new RegExp(search, 'i') },
        { 'keySkills.name': new RegExp(search, 'i') }
      ];
    }
    
    // Apply role-based filtering
    if (req.user.role === 'recruiter') {
      query.$or = [
        { createdBy: req.user._id },
        { 'allocation.all': true },
        { 'allocation.recruiters.recruiterId': req.user._id }
      ];
    } else if (req.user.role === 'vendor') {
      query.$or = [
        { 'allocation.all': true },
        { 'allocation.vendors.vendorId': req.user._id }
      ];
    }
    
    // Execute query
    const requirements = await Requirement
      .find(query)
      .populate('clientId', 'businessDetails.clientName')
      .populate('createdBy', 'firstName lastName')
      .select('-allocation')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Requirement.countDocuments(query);
    
    res.status(200).json({
      status: 'success',
      results: requirements.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        requirements
      }
    });
  });
  
  // Get single requirement
  getRequirement = catchAsync(async (req, res, next) => {
    const requirement = await Requirement
      .findById(req.params.id)
      .populate('clientId')
      .populate('createdBy', 'firstName lastName email')
      .populate('allocation.recruiters.recruiterId', 'firstName lastName')
      .populate('allocation.teams.teamId', 'name')
      .populate('allocation.vendors.vendorId', 'name');
    
    if (!requirement) {
      return next(new AppError('No requirement found with that ID', 404));
    }
    
    // Check access
    if (!requirement.hasAccess(req.user._id) && 
        !['admin', 'super_admin', 'hr'].includes(req.user.role)) {
      return next(new AppError('You do not have access to this requirement', 403));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        requirement
      }
    });
  });
  
  // Update requirement
  updateRequirement = catchAsync(async (req, res, next) => {
    // Remove fields that shouldn't be updated
    delete req.body.createdBy;
    delete req.body.metrics;
    
    const requirement = await Requirement.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        lastUpdatedBy: req.user._id
      },
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!requirement) {
      return next(new AppError('No requirement found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        requirement
      }
    });
  });
  
  // Delete requirement
  deleteRequirement = catchAsync(async (req, res, next) => {
    const requirement = await Requirement.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
        deletedAt: new Date()
      }
    );
    
    if (!requirement) {
      return next(new AppError('No requirement found with that ID', 404));
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
  
  // Allocate requirement
  allocateRequirement = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { allocation } = req.body;
    
    const requirement = await Requirement.findById(id);
    
    if (!requirement) {
      return next(new AppError('No requirement found with that ID', 404));
    }
    
    // Update allocation
    requirement.allocation = allocation;
    
    // Change status to Active if it was Draft
    if (requirement.status === 'Draft') {
      requirement.status = 'Active';
      requirement.publishedAt = new Date();
    }
    
    await requirement.save();
    
    // Send allocation notifications
    await this.sendAllocationNotifications(requirement, allocation);
    
    res.status(200).json({
      status: 'success',
      data: {
        requirement
      }
    });
  });
  
  // Update requirement status
  updateRequirementStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    const requirement = await Requirement.findById(id);
    
    if (!requirement) {
      return next(new AppError('No requirement found with that ID', 404));
    }
    
    requirement.status = status;
    
    if (status === 'Closed') {
      requirement.closedAt = new Date();
    }
    
    requirement.statusHistory = requirement.statusHistory || [];
    requirement.statusHistory.push({
      status,
      reason,
      changedBy: req.user._id,
      changedAt: new Date()
    });
    
    await requirement.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        requirement
      }
    });
  });
  
  // Search requirements
  searchRequirements = catchAsync(async (req, res, next) => {
    const {
      skills,
      experience,
      location,
      salaryRange,
      employmentType
    } = req.query;
    
    const query = { 
      isActive: true, 
      status: 'Active',
      filledCount: { $lt: '$vacancyCount' }
    };
    
    if (skills) {
      const skillArray = skills.split(',').map(s => s.trim());
      query['keySkills.name'] = { $in: skillArray };
    }
    
    if (experience) {
      const [min, max] = experience.split('-').map(e => parseInt(e));
      query.workExpMin = { $lte: max };
      query.workExpMax = { $gte: min };
    }
    
    if (location) {
      query.jobLocation = new RegExp(location, 'i');
    }
    
    if (salaryRange) {
      const [min, max] = salaryRange.split('-').map(s => parseInt(s));
      query.salaryMin = { $gte: min };
      query.salaryMax = { $lte: max };
    }
    
    if (employmentType) {
      query.employmentType = employmentType;
    }
    
    const requirements = await Requirement
      .find(query)
      .populate('clientId', 'businessDetails.clientName')
      .select('jobTitle jobLocation keySkills workExpMin workExpMax salaryMin salaryMax')
      .limit(50);
    
    res.status(200).json({
      status: 'success',
      results: requirements.length,
      data: {
        requirements
      }
    });
  });
  
  // Map candidate to requirement
  mapCandidateToRequirement = catchAsync(async (req, res, next) => {
    const { id, candidateId } = req.params;
    const { status = 'Submitted' } = req.body;
    
    const requirement = await Requirement.findById(id);
    
    if (!requirement) {
      return next(new AppError('No requirement found with that ID', 404));
    }
    
    // Update metrics based on status
    if (status === 'Submitted') {
      requirement.metrics.totalApplications += 1;
    } else if (status === 'Shortlisted') {
      requirement.metrics.shortlisted += 1;
    } else if (status === 'Interview') {
      requirement.metrics.interviewed += 1;
    } else if (status === 'Selected') {
      requirement.metrics.selected += 1;
    } else if (status === 'Joined') {
      requirement.metrics.joined += 1;
      requirement.filledCount += 1;
    }
    
    await requirement.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        requirement
      }
    });
  });
  
  // Clone requirement
  cloneRequirement = catchAsync(async (req, res, next) => {
    const originalRequirement = await Requirement.findById(req.params.id);
    
    if (!originalRequirement) {
      return next(new AppError('No requirement found with that ID', 404));
    }
    
    // Create clone
    const cloneData = originalRequirement.toObject();
    delete cloneData._id;
    delete cloneData.createdAt;
    delete cloneData.updatedAt;
    delete cloneData.metrics;
    delete cloneData.allocation;
    
    cloneData.status = 'Draft';
    cloneData.createdBy = req.user._id;
    cloneData.jobTitle = `${cloneData.jobTitle} (Copy)`;
    
    const clonedRequirement = await Requirement.create(cloneData);
    
    res.status(201).json({
      status: 'success',
      data: {
        requirement: clonedRequirement
      }
    });
  });
  
  // Get requirement statistics
  getRequirementStats = catchAsync(async (req, res, next) => {
    const stats = await Requirement.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalVacancies: { $sum: '$vacancyCount' },
          totalFilled: { $sum: '$filledCount' }
        }
      }
    ]);
    
    const clientStats = await Requirement.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$clientId',
          requirementCount: { $sum: 1 },
          totalVacancies: { $sum: '$vacancyCount' }
        }
      },
      {
        $lookup: {
          from: 'clients',
          localField: '_id',
          foreignField: '_id',
          as: 'client'
        }
      },
      {
        $unwind: '$client'
      },
      {
        $project: {
          clientName: '$client.businessDetails.clientName',
          requirementCount: 1,
          totalVacancies: 1
        }
      }
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        statusStats: stats,
        clientStats
      }
    });
  });
  
  // Bulk create requirements
  bulkCreateRequirements = catchAsync(async (req, res, next) => {
    const { requirements } = req.body;
    
    if (!Array.isArray(requirements) || requirements.length === 0) {
      return next(new AppError('Please provide an array of requirements', 400));
    }
    
    // Add createdBy to each requirement
    const requirementsWithCreator = requirements.map(req => ({
      ...req,
      createdBy: req.user._id
    }));
    
    const createdRequirements = await Requirement.insertMany(requirementsWithCreator);
    
    res.status(201).json({
      status: 'success',
      results: createdRequirements.length,
      data: {
        requirements: createdRequirements
      }
    });
  });
  
  // Send allocation notifications
  async sendAllocationNotifications(requirement, allocation) {
    const notifications = [];
    
    if (allocation.all) {
      // Send to all active recruiters
      // Implementation depends on your user management
    } else {
      // Send to specific allocations
      if (allocation.recruiters) {
        for (const recruiter of allocation.recruiters) {
          notifications.push(
            EmailService.sendRequirementAllocation(
              { _id: recruiter.recruiterId },
              requirement
            )
          );
        }
      }
      
      // Similar for teams, freelancers, vendors
    }
    
    await Promise.all(notifications);
  }
}

module.exports = new RequirementController();
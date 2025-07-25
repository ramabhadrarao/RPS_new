// controllers/agencyController.js
const Agency = require('../models/Agency');
const FreelanceRecruiter = require('../models/FreelanceRecruiter');
const User = require('../models/User');
const FileService = require('../services/fileService');
const EmailService = require('../services/emailService');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

class AgencyController {
  // Register agency
  registerAgency = catchAsync(async (req, res, next) => {
    const agencyData = req.body;
    
    // Create agency
    const agency = new Agency({
      ...agencyData,
      createdBy: req.user?._id || null,
      status: 'Pending'
    });
    
    // Handle document uploads
    if (req.files) {
      const documentTypes = [
        'panCard', 'gstCertificate', 'cancelledCheque',
        'companyRegistration', 'signedNDA', 'bankDetailsLetter'
      ];
      
      for (const docType of documentTypes) {
        if (req.files[docType]) {
          const uploadedDoc = await FileService.uploadSingle(
            req.files[docType][0],
            'Agency',
            agency._id,
            agency.createdBy || 'system',
            'compliance_document'
          );
          
          agency.compliance[docType] = {
            available: true,
            documentId: uploadedDoc._id
          };
        }
      }
      
      if (req.files.digitalSignature) {
        const uploadedSig = await FileService.uploadSingle(
          req.files.digitalSignature[0],
          'Agency',
          agency._id,
          agency.createdBy || 'system',
          'signature'
        );
        
        agency.declaration.digitalSignatureId = uploadedSig._id;
      }
    }
    
    await agency.save();
    
    // Send notification to admin
    await EmailService.queueEmail(
      process.env.ADMIN_EMAIL,
      'New Agency Registration',
      'newAgencyRegistration',
      { agency }
    );
    
    res.status(201).json({
      status: 'success',
      message: 'Agency registration submitted successfully. Awaiting verification.',
      data: {
        agencyId: agency._id,
        agencyCode: agency.agencyCode
      }
    });
  });
  
  // Register freelancer
  registerFreelancer = catchAsync(async (req, res, next) => {
    const freelancerData = req.body;
    
    // Check if email already exists
    const existing = await FreelanceRecruiter.findOne({
      'personalDetails.email': freelancerData.personalDetails.email
    });
    
    if (existing) {
      return next(new AppError('Email already registered', 400));
    }
    
    // Create freelancer
    const freelancer = new FreelanceRecruiter({
      ...freelancerData,
      createdBy: req.user?._id || null,
      status: 'Pending'
    });
    
    // Handle document uploads
    if (req.files) {
      const documentTypes = ['panCard', 'resume', 'signedNDA', 'signature'];
      
      for (const docType of documentTypes) {
        if (req.files[docType]) {
          const uploadedDoc = await FileService.uploadSingle(
            req.files[docType][0],
            'FreelanceRecruiter',
            freelancer._id,
            freelancer.createdBy || 'system',
            docType
          );
          
          freelancer.documents[docType] = {
            uploaded: true,
            documentId: uploadedDoc._id
          };
        }
      }
      
      // Handle multiple certifications
      if (req.files.certifications) {
        freelancer.documents.certifications = [];
        for (const cert of req.files.certifications) {
          const uploadedCert = await FileService.uploadSingle(
            cert,
            'FreelanceRecruiter',
            freelancer._id,
            freelancer.createdBy || 'system',
            'certification'
          );
          
          freelancer.documents.certifications.push({
            name: cert.originalname,
            documentId: uploadedCert._id
          });
        }
      }
    }
    
    await freelancer.save();
    
    res.status(201).json({
      status: 'success',
      message: 'Freelance recruiter registration submitted successfully.',
      data: {
        freelancerId: freelancer._id,
        freelancerCode: freelancer.freelancerCode
      }
    });
  });
  
  // Get agencies
  getAgencies = catchAsync(async (req, res, next) => {
    const {
      status,
      verificationStatus,
      search,
      page = 1,
      limit = 10,
      sort = '-createdAt'
    } = req.query;
    
    const query = { isActive: true };
    
    if (status) query.status = status;
    if (verificationStatus) query.verificationStatus = verificationStatus;
    
    if (search) {
      query['companyDetails.companyName'] = new RegExp(search, 'i');
    }
    
    const agencies = await Agency
      .find(query)
      .select('companyDetails status verificationStatus createdAt')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Agency.countDocuments(query);
    
    res.status(200).json({
      status: 'success',
      results: agencies.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        agencies
      }
    });
  });
  
  // Get single agency
  getAgency = catchAsync(async (req, res, next) => {
    const agency = await Agency
      .findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName');
    
    if (!agency) {
      return next(new AppError('No agency found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        agency
      }
    });
  });
  
  // Update agency
  updateAgency = catchAsync(async (req, res, next) => {
    const agency = await Agency.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!agency) {
      return next(new AppError('No agency found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        agency
      }
    });
  });
  
  // Delete agency
  deleteAgency = catchAsync(async (req, res, next) => {
    const agency = await Agency.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
        deletedAt: new Date()
      }
    );
    
    if (!agency) {
      return next(new AppError('No agency found with that ID', 404));
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
  
  // Verify agency
  verifyAgency = catchAsync(async (req, res, next) => {
    const { verificationStatus, remarks } = req.body;
    
    const agency = await Agency.findById(req.params.id);
    
    if (!agency) {
      return next(new AppError('No agency found with that ID', 404));
    }
    
    agency.verificationStatus = verificationStatus;
    agency.approvedBy = req.user._id;
    agency.approvedAt = new Date();
    
    if (verificationStatus === 'Verified') {
      agency.status = 'Active';
      
      // Create user account for agency
      const user = await User.create({
        email: agency.contactDetails.primaryContact.email,
        password: 'TempPass@123', // Temporary password
        firstName: agency.contactDetails.primaryContact.name.split(' ')[0],
        lastName: agency.contactDetails.primaryContact.name.split(' ').slice(1).join(' '),
        role: 'vendor'
      });
      
      // Send welcome email with credentials
      await EmailService.queueEmail(
        user.email,
        'Agency Account Approved',
        'agencyApproved',
        { agency, tempPassword: 'TempPass@123' }
      );
    }
    
    await agency.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        agency
      }
    });
  });
  
  // Update agency status
  updateAgencyStatus = catchAsync(async (req, res, next) => {
    const { status, reason } = req.body;
    
    const agency = await Agency.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!agency) {
      return next(new AppError('No agency found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        agency
      }
    });
  });
  
  // Get agency performance
  getAgencyPerformance = catchAsync(async (req, res, next) => {
    const agency = await Agency.findById(req.params.id);
    
    if (!agency) {
      return next(new AppError('No agency found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        performanceMetrics: agency.performanceMetrics
      }
    });
  });
  
  // Get freelancers
  getFreelancers = catchAsync(async (req, res, next) => {
    const {
      status,
      skills,
      page = 1,
      limit = 10,
      sort = '-createdAt'
    } = req.query;
    
    const query = { isActive: true };
    
    if (status) query.status = status;
    if (skills) {
      const skillArray = skills.split(',').map(s => s.trim());
      query['experience.keySkills'] = { $in: skillArray };
    }
    
    const freelancers = await FreelanceRecruiter
      .find(query)
      .select('personalDetails status performanceMetrics')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await FreelanceRecruiter.countDocuments(query);
    
    res.status(200).json({
      status: 'success',
      results: freelancers.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        freelancers
      }
    });
  });
}

module.exports = new AgencyController();
// controllers/clientController.js
const Client = require('../models/Client');
const FileService = require('../services/fileService');
const WorkflowService = require('../services/workflowService');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

class ClientController {
  // Create new client
  createClient = catchAsync(async (req, res, next) => {
    const { businessType, subType, businessDetails, documents, ...otherData } = req.body;
    
    // Start transaction
    const session = await Client.startSession();
    session.startTransaction();
    
    try {
      // Create client
      const client = new Client({
        businessType,
        subType,
        businessDetails,
        ...otherData,
        createdBy: req.user._id
      });
      
      // Handle document uploads if any
      if (documents && req.files) {
        const uploadedDocs = await FileService.uploadMultiple(
          req.files,
          'Client',
          client._id,
          req.user._id
        );
        
        // Map uploaded documents
        if (documents.forCandidates) {
          client.documents.forCandidates = documents.forCandidates.map((doc, index) => ({
            ...doc,
            documentId: uploadedDocs[`candidate_doc_${index}`]?._id
          }));
        }
        
        if (documents.forClients) {
          client.documents.forClients = documents.forClients.map((doc, index) => ({
            ...doc,
            documentId: uploadedDocs[`client_doc_${index}`]?._id
          }));
        }
      }
      
      await client.save({ session });
      
      // Initialize workflow
      await WorkflowService.initializeClientWorkflow(client._id, session);
      
      await session.commitTransaction();
      
      res.status(201).json({
        status: 'success',
        data: {
          client
        }
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  });
  
  // Get all clients with filters
  getClients = catchAsync(async (req, res, next) => {
    const {
      businessType,
      industry,
      search,
      status = 'active',
      page = 1,
      limit = 10,
      sort = '-createdAt'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (businessType) query.businessType = businessType;
    if (industry) query['businessDetails.industry'] = industry;
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    
    if (search) {
      query.$text = { $search: search };
    }
    
    // Apply role-based filtering
    if (req.user.role === 'client') {
      query._id = req.user.clientId;
    }
    
    // Execute query
    const clients = await Client
      .find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Client.countDocuments(query);
    
    res.status(200).json({
      status: 'success',
      results: clients.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        clients
      }
    });
  });
  
  // Get single client
  getClient = catchAsync(async (req, res, next) => {
    const client = await Client
      .findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('spocDetails')
      .populate({
        path: 'documents.forCandidates.documentId',
        select: 'originalName url fileType'
      })
      .populate({
        path: 'documents.forClients.documentId',
        select: 'originalName url fileType'
      });
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        client
      }
    });
  });
  
  // Update client
  updateClient = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.createdBy;
    delete updates.createdAt;
    
    const client = await Client.findByIdAndUpdate(
      id,
      {
        ...updates,
        lastUpdatedBy: req.user._id
      },
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        client
      }
    });
  });
  
  // Delete client (soft delete)
  deleteClient = catchAsync(async (req, res, next) => {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
        deletedAt: new Date(),
        deletedBy: req.user._id
      }
    );
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
  
  // Add SPOC
  addSpoc = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const spocData = req.body;
    
    const client = await Client.findById(id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    client.spocDetails.push(spocData);
    await client.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        spoc: client.spocDetails[client.spocDetails.length - 1]
      }
    });
  });
  
  // Update SPOC
  updateSpoc = catchAsync(async (req, res, next) => {
    const { id, spocId } = req.params;
    const updates = req.body;
    
    const client = await Client.findById(id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    const spoc = client.spocDetails.id(spocId);
    
    if (!spoc) {
      return next(new AppError('No SPOC found with that ID', 404));
    }
    
    Object.assign(spoc, updates);
    await client.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        spoc
      }
    });
  });
  
  // Remove SPOC
  removeSpoc = catchAsync(async (req, res, next) => {
    const { id, spocId } = req.params;
    
    const client = await Client.findById(id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    client.spocDetails.pull(spocId);
    await client.save();
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
  
  // Get client statistics
  getClientStats = catchAsync(async (req, res, next) => {
    const stats = await Client.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$businessType',
          count: { $sum: 1 },
          industries: { $addToSet: '$businessDetails.industry' }
        }
      },
      {
        $project: {
          businessType: '$_id',
          count: 1,
          industryCount: { $size: '$industries' },
          _id: 0
        }
      }
    ]);
    
    const totalClients = await Client.countDocuments({ isActive: true });
    const activeSpocs = await Client.aggregate([
      { $unwind: '$spocDetails' },
      { $match: { 'spocDetails.status': 'Active' } },
      { $count: 'total' }
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        totalClients,
        activeSpocs: activeSpocs[0]?.total || 0,
        byBusinessType: stats
      }
    });
  });

  // Get blocklisted companies
  getBlocklistedCompanies = catchAsync(async (req, res, next) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    // Parse blocklist file if exists
    if (client.verificationPolicy?.blocklistUploads?.blocklistedCompaniesFileId) {
      const file = await FileService.getFile(
        client.verificationPolicy.blocklistUploads.blocklistedCompaniesFileId,
        req.user
      );
      
      // Parse CSV/Excel file
      const companies = await WorkflowService.parseBlocklistFile(file);
      
      res.status(200).json({
        status: 'success',
        data: { companies }
      });
    } else {
      res.status(200).json({
        status: 'success',
        data: { companies: [] }
      });
    }
  });

  // Upload blocklisted companies
  uploadBlocklistedCompanies = catchAsync(async (req, res, next) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    if (!req.file) {
      return next(new AppError('Please upload a file', 400));
    }
    
    // Upload file
    const uploadedFile = await FileService.uploadSingle(
      req.file,
      'Client',
      client._id,
      req.user._id,
      'blocklist'
    );
    
    // Update client
    if (!client.verificationPolicy) {
      client.verificationPolicy = {};
    }
    if (!client.verificationPolicy.blocklistUploads) {
      client.verificationPolicy.blocklistUploads = {};
    }
    client.verificationPolicy.blocklistUploads.blocklistedCompaniesFileId = uploadedFile._id;
    await client.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        fileId: uploadedFile._id
      }
    });
  });

  // Clear blocklisted companies
  clearBlocklistedCompanies = catchAsync(async (req, res, next) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    if (client.verificationPolicy?.blocklistUploads?.blocklistedCompaniesFileId) {
      client.verificationPolicy.blocklistUploads.blocklistedCompaniesFileId = null;
      await client.save();
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Blocklisted companies cleared'
    });
  });

  // Get blocklisted universities
  getBlocklistedUniversities = catchAsync(async (req, res, next) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    if (client.verificationPolicy?.blocklistUploads?.blocklistedUniversitiesFileId) {
      const file = await FileService.getFile(
        client.verificationPolicy.blocklistUploads.blocklistedUniversitiesFileId,
        req.user
      );
      
      const universities = await WorkflowService.parseBlocklistFile(file);
      
      res.status(200).json({
        status: 'success',
        data: { universities }
      });
    } else {
      res.status(200).json({
        status: 'success',
        data: { universities: [] }
      });
    }
  });

  // Upload blocklisted universities
  uploadBlocklistedUniversities = catchAsync(async (req, res, next) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    if (!req.file) {
      return next(new AppError('Please upload a file', 400));
    }
    
    const uploadedFile = await FileService.uploadSingle(
      req.file,
      'Client',
      client._id,
      req.user._id,
      'blocklist'
    );
    
    if (!client.verificationPolicy) {
      client.verificationPolicy = {};
    }
    if (!client.verificationPolicy.blocklistUploads) {
      client.verificationPolicy.blocklistUploads = {};
    }
    client.verificationPolicy.blocklistUploads.blocklistedUniversitiesFileId = uploadedFile._id;
    await client.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        fileId: uploadedFile._id
      }
    });
  });

  // Clear blocklisted universities
  clearBlocklistedUniversities = catchAsync(async (req, res, next) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return next(new AppError('No client found with that ID', 404));
    }
    
    if (client.verificationPolicy?.blocklistUploads?.blocklistedUniversitiesFileId) {
      client.verificationPolicy.blocklistUploads.blocklistedUniversitiesFileId = null;
      await client.save();
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Blocklisted universities cleared'
    });
  });
}

module.exports = new ClientController();
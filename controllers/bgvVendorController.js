// controllers/bgvVendorController.js
const BGVVendor = require('../models/BGVVendor');
const FileService = require('../services/fileService');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

class BGVVendorController {
  // Create new vendor
  createVendor = catchAsync(async (req, res, next) => {
    const { documents, ...vendorData } = req.body;
    
    // Create vendor
    const vendor = new BGVVendor({
      ...vendorData,
      createdBy: req.user._id
    });
    
    // Handle document uploads
    if (documents && req.files) {
      const uploadedDocs = await FileService.uploadMultiple(
        req.files,
        'BGVVendor',
        vendor._id,
        req.user._id
      );
      
      vendor.documents = documents.map((doc, index) => ({
        ...doc,
        documentId: uploadedDocs[`documents_${index}`]?._id
      }));
    }
    
    await vendor.save();
    
    res.status(201).json({
      status: 'success',
      data: {
        vendor
      }
    });
  });
  
  // Get all vendors
  getVendors = catchAsync(async (req, res, next) => {
    const {
      clientId,
      status,
      search,
      page = 1,
      limit = 10,
      sort = '-createdAt'
    } = req.query;
    
    // Build query
    const query = { isActive: true };
    
    if (clientId) query.clientId = clientId;
    if (status) query.status = status;
    
    if (search) {
      query.$or = [
        { vendorName: new RegExp(search, 'i') },
        { 'spocDetails.name': new RegExp(search, 'i') },
        { 'spocDetails.email': new RegExp(search, 'i') }
      ];
    }
    
    // Execute query
    const vendors = await BGVVendor
      .find(query)
      .populate('clientId', 'businessDetails.clientName')
      .populate('createdBy', 'firstName lastName')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await BGVVendor.countDocuments(query);
    
    res.status(200).json({
      status: 'success',
      results: vendors.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        vendors
      }
    });
  });
  
  // Get single vendor
  getVendor = catchAsync(async (req, res, next) => {
    const vendor = await BGVVendor
      .findById(req.params.id)
      .populate('clientId')
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'documents.documentId',
        select: 'originalName url fileType'
      });
    
    if (!vendor) {
      return next(new AppError('No vendor found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        vendor
      }
    });
  });
  
  // Update vendor
  updateVendor = catchAsync(async (req, res, next) => {
    const updates = req.body;
    
    // Remove fields that shouldn't be updated
    delete updates._id;
    delete updates.createdBy;
    
    const vendor = await BGVVendor.findByIdAndUpdate(
      req.params.id,
      {
        ...updates,
        lastUpdatedBy: req.user._id
      },
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!vendor) {
      return next(new AppError('No vendor found with that ID', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        vendor
      }
    });
  });
  
  // Delete vendor
  deleteVendor = catchAsync(async (req, res, next) => {
    const vendor = await BGVVendor.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
        deletedAt: new Date()
      }
    );
    
    if (!vendor) {
      return next(new AppError('No vendor found with that ID', 404));
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
  
  // Add SPOC
  addSpoc = catchAsync(async (req, res, next) => {
    const vendor = await BGVVendor.findById(req.params.id);
    
    if (!vendor) {
      return next(new AppError('No vendor found with that ID', 404));
    }
    
    vendor.spocDetails.push(req.body);
    await vendor.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        spoc: vendor.spocDetails[vendor.spocDetails.length - 1]
      }
    });
  });
  
  // Update SPOC
  updateSpoc = catchAsync(async (req, res, next) => {
    const { id, spocId } = req.params;
    
    const vendor = await BGVVendor.findById(id);
    
    if (!vendor) {
      return next(new AppError('No vendor found with that ID', 404));
    }
    
    const spoc = vendor.spocDetails.id(spocId);
    
    if (!spoc) {
      return next(new AppError('No SPOC found with that ID', 404));
    }
    
    Object.assign(spoc, req.body);
    await vendor.save();
    
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
    
    const vendor = await BGVVendor.findById(id);
    
    if (!vendor) {
      return next(new AppError('No vendor found with that ID', 404));
    }
    
    vendor.spocDetails.pull(spocId);
    await vendor.save();
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
  
  // Add document
  addDocument = catchAsync(async (req, res, next) => {
    const vendor = await BGVVendor.findById(req.params.id);
    
    if (!vendor) {
      return next(new AppError('No vendor found with that ID', 404));
    }
    
    if (!req.files || !req.files.document) {
      return next(new AppError('Please upload a document', 400));
    }
    
    const uploadedDoc = await FileService.uploadSingle(
      req.files.document[0],
      'BGVVendor',
      vendor._id,
      req.user._id,
      'agreement'
    );
    
    vendor.documents.push({
      documentId: uploadedDoc._id,
      name: req.body.name,
      hasValidity: req.body.hasValidity === 'true',
      startDate: req.body.startDate,
      endDate: req.body.endDate
    });
    
    await vendor.save();
    
    res.status(200).json({
      status: 'success',
      data: {
        document: vendor.documents[vendor.documents.length - 1]
      }
    });
  });
  
  // Remove document
  removeDocument = catchAsync(async (req, res, next) => {
    const { id, documentId } = req.params;
    
    const vendor = await BGVVendor.findById(id);
    
    if (!vendor) {
      return next(new AppError('No vendor found with that ID', 404));
    }
    
    vendor.documents = vendor.documents.filter(
      doc => doc._id.toString() !== documentId
    );
    
    await vendor.save();
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
}

module.exports = new BGVVendorController();
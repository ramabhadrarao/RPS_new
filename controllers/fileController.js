// controllers/fileController.js
const FileDocument = require('../models/FileDocument');
const { FileService } = require('../services/fileService');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

class FileController {
  // Get file
  getFile = catchAsync(async (req, res, next) => {
    const file = await FileService.getFile(req.params.id, req.user);
    
    res.status(200).json({
      status: 'success',
      data: {
        file
      }
    });
  });
  
  // Delete file
  deleteFile = catchAsync(async (req, res, next) => {
    const file = await FileService.deleteFile(req.params.id, req.user._id);
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
  
  // Verify document
  verifyDocument = catchAsync(async (req, res, next) => {
    const { status, notes } = req.body;
    
    const file = await FileService.verifyDocument(
      req.params.id,
      req.user._id,
      status,
      notes
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        file
      }
    });
  });
  
  // Bulk verify documents
  bulkVerifyDocuments = catchAsync(async (req, res, next) => {
    const { fileIds, status } = req.body;
    
    const result = await FileService.bulkVerify(
      fileIds,
      req.user._id,
      status
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  });
  
  // Get entity documents
  getEntityDocuments = catchAsync(async (req, res, next) => {
    const { entityType, entityId } = req.params;
    const { category } = req.query;
    
    const documents = await FileService.getEntityDocuments(
      entityType,
      entityId,
      category
    );
    
    res.status(200).json({
      status: 'success',
      results: documents.length,
      data: {
        documents
      }
    });
  });
}

module.exports = new FileController();

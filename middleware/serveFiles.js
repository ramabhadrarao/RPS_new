// middleware/serveFiles.js
const path = require('path');
const fs = require('fs').promises;
const FileDocument = require('../models/FileDocument');
const { AppError } = require('../utils/appError');

// Middleware to serve uploaded files with access control
exports.serveFile = async (req, res, next) => {
  try {
    // Extract file path from URL
    const filePath = req.path.replace('/uploads/', '');
    
    // Find file document by path
    const fileDoc = await FileDocument.findOne({ 
      s3Key: filePath,
      isDeleted: false 
    });
    
    if (!fileDoc) {
      return next(new AppError('File not found', 404));
    }
    
    // Check access permissions
    if (!req.user) {
      // Public files only for non-authenticated users
      if (fileDoc.accessLevel !== 'public') {
        return next(new AppError('Authentication required', 401));
      }
    } else {
      // Check user permissions
      const hasAccess = await checkFileAccess(fileDoc, req.user);
      if (!hasAccess) {
        return next(new AppError('Access denied', 403));
      }
    }
    
    // Get full file path
    const fullPath = path.join(__dirname, '..', 'uploads', filePath);
    
    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      return next(new AppError('File not found on disk', 404));
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', fileDoc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileDoc.originalName}"`);
    
    // For download links, use: res.setHeader('Content-Disposition', `attachment; filename="${fileDoc.originalName}"`);
    
    // Send file
    res.sendFile(fullPath);
    
    // Update access tracking
    if (req.user) {
      fileDoc.lastAccessedBy = req.user._id;
      fileDoc.lastAccessedAt = new Date();
      fileDoc.accessCount += 1;
      await fileDoc.save();
    }
    
  } catch (error) {
    next(error);
  }
};

// Check file access permissions
async function checkFileAccess(fileDoc, user) {
  // Admin and super admin have access to all files
  if (['admin', 'super_admin'].includes(user.role)) {
    return true;
  }
  
  // Check if user uploaded the file
  if (fileDoc.uploadedBy.toString() === user._id.toString()) {
    return true;
  }
  
  // Check if user is in allowed users list
  if (fileDoc.allowedUsers.some(id => id.toString() === user._id.toString())) {
    return true;
  }
  
  // Check based on access level
  if (fileDoc.accessLevel === 'public') {
    return true;
  }
  
  if (fileDoc.accessLevel === 'internal' && user.role !== 'client') {
    return true;
  }
  
  // Check entity-based access
  if (fileDoc.entityType === 'Candidate') {
    const Candidate = require('../models/Candidate');
    const candidate = await Candidate.findById(fileDoc.entityId);
    
    if (candidate) {
      // Check if user created or is assigned to the candidate
      if (candidate.createdBy.toString() === user._id.toString() ||
          candidate.assignedTo?.toString() === user._id.toString()) {
        return true;
      }
    }
  }
  
  return false;
}

// Middleware to handle file downloads
exports.downloadFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    
    // Find file document
    const fileDoc = await FileDocument.findById(fileId);
    
    if (!fileDoc || fileDoc.isDeleted) {
      return next(new AppError('File not found', 404));
    }
    
    // Check access permissions
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const hasAccess = await checkFileAccess(fileDoc, req.user);
    if (!hasAccess) {
      return next(new AppError('Access denied', 403));
    }
    
    // Get full file path
    const fullPath = path.join(__dirname, '..', 'uploads', fileDoc.s3Key);
    
    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      return next(new AppError('File not found on disk', 404));
    }
    
    // Set download headers
    res.setHeader('Content-Type', fileDoc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileDoc.originalName}"`);
    
    // Send file
    res.sendFile(fullPath);
    
    // Update access tracking
    fileDoc.lastAccessedBy = req.user._id;
    fileDoc.lastAccessedAt = new Date();
    fileDoc.accessCount += 1;
    await fileDoc.save();
    
  } catch (error) {
    next(error);
  }
};
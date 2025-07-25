// services/fileService.js
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const FileDocument = require('../models/FileDocument');
const config = require('../config/constants');
const { AppError } = require('../utils/appError');

class FileService {
  constructor() {
    // Base upload directory
    this.uploadDir = path.join(__dirname, '..', 'uploads');
    
    // Ensure upload directory exists
    this.ensureUploadDirs();
  }
  
  // Ensure upload directories exist
  async ensureUploadDirs() {
    const dirs = [
      this.uploadDir,
      path.join(this.uploadDir, 'Candidate'),
      path.join(this.uploadDir, 'Client'),
      path.join(this.uploadDir, 'Requirement'),
      path.join(this.uploadDir, 'BGVVendor'),
      path.join(this.uploadDir, 'Agency'),
      path.join(this.uploadDir, 'User')
    ];
    
    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
      }
    }
  }
  
  // Generate secure file name
  generateFileName(originalName, entityType, entityId, category) {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(16).toString('hex');
    const extension = originalName.split('.').pop();
    const sanitizedName = originalName
      .split('.')[0]
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    
    return `${entityType}/${entityId}/${category}/${timestamp}_${randomString}_${sanitizedName}.${extension}`;
  }
  
  // Upload single file
  async uploadSingle(file, entityType, entityId, uploadedBy, category = 'other') {
    try {
      const fileName = this.generateFileName(
        file.originalname,
        entityType,
        entityId,
        category
      );
      
      // Create directory structure
      const filePath = path.join(this.uploadDir, fileName);
      const fileDir = path.dirname(filePath);
      await fs.mkdir(fileDir, { recursive: true });
      
      // Write file to disk
      await fs.writeFile(filePath, file.buffer);
      
      // Generate URL for accessing the file
      const fileUrl = `/uploads/${fileName}`;
      
      // Create file document
      const fileDocument = new FileDocument({
        originalName: file.originalname,
        fileName: fileName.split('/').pop(),
        fileType: file.originalname.split('.').pop(),
        mimeType: file.mimetype,
        size: file.size,
        url: fileUrl,
        s3Key: fileName, // Using as local path reference
        bucket: 'local', // Indicator that it's local storage
        category,
        entityType,
        entityId,
        uploadedBy
      });
      
      await fileDocument.save();
      
      // Initiate virus scan
      this.initiateVirusScan(fileDocument._id);
      
      return fileDocument;
    } catch (error) {
      console.error('File upload error:', error);
      throw new AppError('File upload failed', 500);
    }
  }
  
  // Upload multiple files
  async uploadMultiple(files, entityType, entityId, uploadedBy) {
    const uploadPromises = [];
    const uploadedFiles = {};
    
    for (const [fieldName, fileArray] of Object.entries(files)) {
      for (const file of fileArray) {
        const category = this.determineCategoryFromFieldName(fieldName);
        const uploadPromise = this.uploadSingle(
          file,
          entityType,
          entityId,
          uploadedBy,
          category
        ).then(doc => {
          uploadedFiles[fieldName] = doc;
        });
        uploadPromises.push(uploadPromise);
      }
    }
    
    await Promise.all(uploadPromises);
    return uploadedFiles;
  }
  
  // Get file
  async getFile(fileId, userId) {
    const file = await FileDocument.findById(fileId);
    
    if (!file || file.isDeleted) {
      throw new AppError('File not found', 404);
    }
    
    // Check access permissions
    if (!this.hasAccess(file, userId)) {
      throw new AppError('You do not have permission to access this file', 403);
    }
    
    // Update access tracking
    file.lastAccessedBy = userId;
    file.lastAccessedAt = new Date();
    file.accessCount += 1;
    await file.save();
    
    // Check if file exists on disk
    const filePath = path.join(this.uploadDir, file.s3Key);
    try {
      await fs.access(filePath);
    } catch {
      throw new AppError('File not found on disk', 404);
    }
    
    return {
      ...file.toObject(),
      filePath // Return local file path for serving
    };
  }
  
  // Get file buffer (for parsing blocklist files)
  async getFileBuffer(fileId) {
    const file = await FileDocument.findById(fileId);
    
    if (!file || file.isDeleted) {
      throw new AppError('File not found', 404);
    }
    
    const filePath = path.join(this.uploadDir, file.s3Key);
    const buffer = await fs.readFile(filePath);
    
    return {
      buffer,
      fileType: file.fileType,
      mimeType: file.mimeType
    };
  }
  
  // Delete file (soft delete)
  async deleteFile(fileId, userId) {
    const file = await FileDocument.findById(fileId);
    
    if (!file) {
      throw new AppError('File not found', 404);
    }
    
    // Check permissions
    if (file.uploadedBy.toString() !== userId.toString()) {
      throw new AppError('You can only delete files you uploaded', 403);
    }
    
    file.isDeleted = true;
    file.deletedBy = userId;
    file.deletedAt = new Date();
    await file.save();
    
    // Schedule physical deletion after 30 days
    this.schedulePhysicalDeletion(file.s3Key, 30);
    
    return file;
  }
  
  // Verify document
  async verifyDocument(fileId, userId, status, notes) {
    const file = await FileDocument.findById(fileId);
    
    if (!file) {
      throw new AppError('File not found', 404);
    }
    
    file.isVerified = status === 'approved';
    file.verifiedBy = userId;
    file.verifiedAt = new Date();
    
    if (notes) {
      file.metadata.verificationNotes = notes;
    }
    
    await file.save();
    
    return file;
  }
  
  // Check file access
  hasAccess(file, userId) {
    // Super admin and admin have access to all files
    if (['super_admin', 'admin'].includes(userId.role)) {
      return true;
    }
    
    // Check if user uploaded the file
    if (file.uploadedBy.toString() === userId.toString()) {
      return true;
    }
    
    // Check if user is in allowed users list
    if (file.allowedUsers.includes(userId)) {
      return true;
    }
    
    // Check based on access level
    if (file.accessLevel === 'public') {
      return true;
    }
    
    if (file.accessLevel === 'internal' && userId.role !== 'client') {
      return true;
    }
    
    return false;
  }
  
  // Determine category from field name
  determineCategoryFromFieldName(fieldName) {
    const categoryMap = {
      resume: 'resume',
      cv: 'resume',
      certificate: 'education_certificate',
      education: 'education_certificate',
      experience: 'experience_letter',
      relieving: 'relieving_letter',
      payslip: 'payslip',
      salary: 'payslip',
      bank: 'bank_statement',
      offer: 'offer_letter',
      aadhaar: 'kyc_document',
      pan: 'kyc_document',
      passport: 'kyc_document',
      photo: 'photo',
      agreement: 'agreement',
      policy: 'policy_document'
    };
    
    const lowerFieldName = fieldName.toLowerCase();
    
    for (const [key, category] of Object.entries(categoryMap)) {
      if (lowerFieldName.includes(key)) {
        return category;
      }
    }
    
    return 'other';
  }
  
  // Initiate virus scan (placeholder for actual implementation)
  async initiateVirusScan(fileId) {
    // In a production environment, you would integrate with a virus scanning service
    // For now, we'll just mark files as clean after a delay
    setTimeout(async () => {
      try {
        await FileDocument.findByIdAndUpdate(fileId, {
          virusScanStatus: 'clean',
          virusScanResult: { scannedAt: new Date(), result: 'clean' }
        });
      } catch (error) {
        console.error('Virus scan update error:', error);
      }
    }, 1000);
  }
  
  // Schedule physical deletion
  async schedulePhysicalDeletion(filePath, daysDelay) {
    // In production, use a job queue like Bull
    // For now, we'll use setTimeout for demonstration
    const delay = daysDelay * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    
    setTimeout(async () => {
      try {
        const fullPath = path.join(this.uploadDir, filePath);
        await fs.unlink(fullPath);
        console.log(`Physically deleted file: ${filePath}`);
      } catch (error) {
        console.error(`Error deleting file ${filePath}:`, error);
      }
    }, delay);
  }
  
  // Get entity documents
  async getEntityDocuments(entityType, entityId, category = null) {
    const query = {
      entityType,
      entityId,
      isDeleted: false
    };
    
    if (category) {
      query.category = category;
    }
    
    return FileDocument.find(query)
      .populate('uploadedBy', 'firstName lastName')
      .populate('verifiedBy', 'firstName lastName')
      .sort('-createdAt');
  }
  
  // Bulk file operations
  async bulkVerify(fileIds, userId, status) {
    const updates = await FileDocument.updateMany(
      { _id: { $in: fileIds } },
      {
        isVerified: status === 'approved',
        verifiedBy: userId,
        verifiedAt: new Date()
      }
    );
    
    return updates;
  }
  
  // Clean up old deleted files
  async cleanupDeletedFiles() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const deletedFiles = await FileDocument.find({
      isDeleted: true,
      deletedAt: { $lt: thirtyDaysAgo }
    });
    
    for (const file of deletedFiles) {
      try {
        const filePath = path.join(this.uploadDir, file.s3Key);
        await fs.unlink(filePath);
        await FileDocument.findByIdAndDelete(file._id);
        console.log(`Cleaned up file: ${file.originalName}`);
      } catch (error) {
        console.error(`Error cleaning up file ${file._id}:`, error);
      }
    }
  }
  
  // Validate file header (basic implementation)
  async validateFileHeader(buffer, mimeType) {
    // Basic file signature validation
    const signatures = {
      'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46, 0x38]
    };
    
    const signature = signatures[mimeType];
    if (!signature) return true; // Skip validation for unknown types
    
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }
    
    return true;
  }
}

// Multer configuration for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxFileSize // 10MB default
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = config.upload.allowedTypes;
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Invalid file type', 400), false);
    }
  }
});

module.exports = {
  FileService: new FileService(),
  upload
};
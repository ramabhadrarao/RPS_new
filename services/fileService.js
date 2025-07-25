// services/fileService.js
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const crypto = require('crypto');
const FileDocument = require('../models/FileDocument');
const config = require('../config/constants');
const { AppError } = require('../utils/appError');

class FileService {
  constructor() {
    // Configure AWS S3
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });
    
    this.bucket = process.env.AWS_S3_BUCKET;
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
      
      // Upload to S3
      const uploadParams = {
        Bucket: this.bucket,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ServerSideEncryption: 'AES256',
        Metadata: {
          uploadedBy: uploadedBy.toString(),
          entityType,
          entityId: entityId.toString(),
          category
        }
      };
      
      const s3Response = await this.s3.upload(uploadParams).promise();
      
      // Create file document
      const fileDocument = new FileDocument({
        originalName: file.originalname,
        fileName: fileName.split('/').pop(),
        fileType: file.originalname.split('.').pop(),
        mimeType: file.mimetype,
        size: file.size,
        url: s3Response.Location,
        s3Key: s3Response.Key,
        bucket: this.bucket,
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
    
    // Generate pre-signed URL for secure access
    const signedUrl = await this.generateSignedUrl(file.s3Key);
    
    return {
      ...file.toObject(),
      url: signedUrl
    };
  }
  
  // Generate pre-signed URL
  async generateSignedUrl(key, expiresIn = 3600) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn
    };
    
    return this.s3.getSignedUrlPromise('getObject', params);
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
    
    // Schedule S3 deletion after 30 days
    this.scheduleS3Deletion(file.s3Key, 30);
    
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
  
  // Initiate virus scan (using ClamAV or similar)
  async initiateVirusScan(fileId) {
    // Queue virus scan job
    // Implementation depends on your virus scanning service
  }
  
  // Schedule S3 deletion
  async scheduleS3Deletion(key, daysDelay) {
    // Schedule deletion job
    // Implementation depends on your job queue service
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